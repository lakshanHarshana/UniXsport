const express = require('express');
const router = express.Router();
const { db, saveDatabase, getMongoDb, syncDocToMongo, isMongoConnected } = require('../db');
const { authenticateToken } = require('../middleware/auth');

/**
 * @route   GET /api/sync/status
 * @desc    Health check & server timestamp for sync client clock alignment
 */
router.get('/status', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    serverTime: new Date().toISOString(),
    isMongoConnected: typeof isMongoConnected === 'function' ? isMongoConnected() : false,
    version: '2.0.0-super-hybrid'
  });
});

/**
 * @route   GET /api/sync/pull
 * @desc    Pull deltas/changes that occurred after 'since' timestamp
 */
router.get('/pull', async (req, res) => {
  try {
    const sinceStr = req.query.since || '1970-01-01T00:00:00.000Z';
    const sinceTime = new Date(sinceStr).getTime();
    const requestedCols = req.query.collections ? req.query.collections.split(',') : ['equipment', 'gymRequests', 'notices', 'borrowLogs'];

    const deltas = {};
    const mongo = typeof getMongoDb === 'function' ? getMongoDb() : null;

    for (const colName of requestedCols) {
      let items = db[colName] || [];

      // If live MongoDB is available, pull fresh items
      if (mongo) {
        try {
          const docs = await mongo.collection(colName).find({}).toArray();
          if (docs && docs.length > 0) {
            items = docs.map(d => {
              const c = Object.assign({}, d);
              delete c._id;
              return c;
            });
            db[colName] = items;
          }
        } catch (e) {
          console.warn('[Sync Pull] Mongo read error for ' + colName + ':', e.message);
        }
      }

      // Filter only modified or newly created items since the given timestamp
      const changed = items.filter(item => {
        const itemUpdate = item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
        const itemCreate = item.createdAt ? new Date(item.createdAt).getTime() : 0;
        return (itemUpdate > sinceTime) || (itemCreate > sinceTime);
      });

      deltas[colName] = changed;
    }

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      deltas
    });
  } catch (err) {
    console.error('[Sync Pull Error]:', err);
    res.status(500).json({ success: false, error: 'Failed to pull cloud database deltas' });
  }
});

/**
 * @route   POST /api/sync/push
 * @desc    Process transactional outbox mutations from offline clients (Authenticated)
 */
router.post('/push', authenticateToken, async (req, res) => {
  try {
    const mutations = req.body.mutations || [];
    if (!Array.isArray(mutations) || mutations.length === 0) {
      return res.json({ success: true, appliedCount: 0, processedIds: [] });
    }

    if (!db.processedMutations) db.processedMutations = [];
    const processedIds = [];
    const mongo = typeof getMongoDb === 'function' ? getMongoDb() : null;

    for (const mut of mutations) {
      const { mutationId, action, entityId, patch, clientTimestamp } = mut;
      if (!mutationId) continue;

      // 1. Idempotency Check: Prevent duplicate execution
      const alreadyProcessed = db.processedMutations.some(m => (m.id || m.mutationId) === mutationId);
      if (alreadyProcessed) {
        processedIds.push(mutationId);
        continue;
      }

      const nowIso = new Date().toISOString();

      // 2. Process Action Types with Authorization & Validation
      if (action === 'UPDATE_PROFILE') {
        const user = (db.users || []).find(u => {
          const uId = String(u.id || '').toLowerCase();
          const uUid = String(u.user_id || u.userId || '').toLowerCase();
          const uReg = String(u.regNo || '').toLowerCase();
          const target = String(entityId || '').toLowerCase();
          return uId === target || uUid === target || uReg === target;
        });

        // Ensure user is authorized to update this profile (Self or Admin)
        const isAuthorized = req.user && (
          req.user.role === 'admin' ||
          (user && (
            String(user.id) === String(req.user.id) ||
            String(user.user_id || user.userId || '').toLowerCase() === String(req.user.user_id || req.user.userId || '').toLowerCase() ||
            String(user.regNo || '').toLowerCase() === String(req.user.regNo || '').toLowerCase()
          ))
        );

        if (!isAuthorized) {
          console.warn('[Sync Push] Unauthorized UPDATE_PROFILE mutation rejected for entity:', entityId);
          processedIds.push(mutationId);
          continue;
        }

        if (user && patch) {
          // Merge field-level patch cleanly
          const allowedFields = ['name', 'age', 'height', 'weight', 'fitnessLevel', 'injuryHistory', 'trainingGoal', 'bio', 'avatarUrl', 'profilePhoto', 'profileImage', 'faculty', 'department', 'phone', 'gender', 'year'];
          allowedFields.forEach(f => {
            if (patch[f] !== undefined) {
              user[f] = patch[f];
            }
          });
          user.updatedAt = nowIso;
          user._version = (user._version || 1) + 1;

          if (mongo) {
            try {
              const cleanUser = Object.assign({}, user);
              delete cleanUser._id;
              await mongo.collection('users').replaceOne({ id: user.id }, cleanUser, { upsert: true });
            } catch(e) {}
          }
        }
      } else if (action === 'BORROW_EQUIPMENT') {
        const equip = (db.equipment || []).find(e => String(e.id) === String(entityId) || String(e.name).toLowerCase() === String(patch.equipmentName || '').toLowerCase());
        const borrowQty = parseInt(patch.quantity || patch.qty || 1, 10);

        if (equip) {
          const currentAvail = equip.availableQty !== undefined ? equip.availableQty : (equip.available || 0);
          // Atomic stock verification: Prevent negative stock
          if (currentAvail >= borrowQty) {
            equip.availableQty = Math.max(0, currentAvail - borrowQty);
            equip.available = equip.availableQty;
            equip.borrowedQty = (equip.borrowedQty || equip.borrowed || 0) + borrowQty;
            equip.borrowed = equip.borrowedQty;
            equip.updatedAt = nowIso;
            equip._version = (equip._version || 1) + 1;

            if (mongo) {
              try {
                const cleanEq = Object.assign({}, equip);
                delete cleanEq._id;
                await mongo.collection('equipment').replaceOne({ id: equip.id }, cleanEq, { upsert: true });
              } catch(e) {}
            }
          } else {
            console.warn('[Sync Push] Out of stock for BORROW_EQUIPMENT:', equip.name);
          }
        }

        // Record Borrow Log
        if (!db.borrowLogs) db.borrowLogs = [];
        const newLog = Object.assign({
          id: patch.logId || ('borrow_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
          equipmentId: equip ? equip.id : entityId,
          equipmentName: equip ? equip.name : (patch.equipmentName || 'Equipment'),
          quantity: borrowQty,
          status: 'borrowed',
          borrowedAt: clientTimestamp || nowIso,
          createdAt: nowIso,
          updatedAt: nowIso,
          _version: 1
        }, patch);

        db.borrowLogs.push(newLog);
        if (mongo) {
          try {
            const cleanLog = Object.assign({}, newLog);
            delete cleanLog._id;
            await mongo.collection('borrowLogs').replaceOne({ id: newLog.id }, cleanLog, { upsert: true });
          } catch(e) {}
        }
      } else if (action === 'RETURN_EQUIPMENT') {
        const log = (db.borrowLogs || []).find(l => String(l.id) === String(entityId));
        if (log && log.status !== 'returned') {
          log.status = 'returned';
          log.returnedAt = nowIso;
          log.updatedAt = nowIso;
          log._version = (log._version || 1) + 1;

          const returnQty = parseInt(log.quantity || 1, 10);
          const equip = (db.equipment || []).find(e => String(e.id) === String(log.equipmentId) || String(e.name).toLowerCase() === String(log.equipmentName || '').toLowerCase());
          if (equip) {
            const currentAvail = equip.availableQty !== undefined ? equip.availableQty : (equip.available || 0);
            equip.availableQty = currentAvail + returnQty;
            equip.available = equip.availableQty;
            equip.borrowedQty = Math.max(0, (equip.borrowedQty || equip.borrowed || 0) - returnQty);
            equip.borrowed = equip.borrowedQty;
            equip.updatedAt = nowIso;
            equip._version = (equip._version || 1) + 1;

            if (mongo) {
              try {
                const cleanEq = Object.assign({}, equip);
                delete cleanEq._id;
                await mongo.collection('equipment').replaceOne({ id: equip.id }, cleanEq, { upsert: true });
              } catch(e) {}
            }
          }

          if (mongo) {
            try {
              const cleanLog = Object.assign({}, log);
              delete cleanLog._id;
              await mongo.collection('borrowLogs').replaceOne({ id: log.id }, cleanLog, { upsert: true });
            } catch(e) {}
          }
        }
      } else if (action === 'CREATE_REQUEST') {
        if (!db.gymRequests) db.gymRequests = [];
        const existing = db.gymRequests.find(r => r.id === entityId || r.mutationId === mutationId);
        if (!existing) {
          const newReq = Object.assign({
            id: entityId || ('req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
            mutationId,
            status: 'pending',
            createdAt: clientTimestamp || nowIso,
            updatedAt: nowIso,
            _version: 1
          }, patch);
          db.gymRequests.push(newReq);
          if (mongo) {
            try {
              const cleanReq = Object.assign({}, newReq);
              delete cleanReq._id;
              await mongo.collection('gymRequests').replaceOne({ id: newReq.id }, cleanReq, { upsert: true });
            } catch(e) {}
          }
        }
      }

      // Record mutation as processed
      db.processedMutations.push({
        id: mutationId,
        mutationId,
        action,
        processedAt: nowIso
      });
      processedIds.push(mutationId);
    }

    // Persist to local JSON mirror and MongoDB
    saveDatabase();

    res.json({
      success: true,
      appliedCount: processedIds.length,
      processedIds,
      serverTime: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Sync Push Error]:', err);
    res.status(500).json({ success: false, error: 'Failed to process sync outbox mutations' });
  }
});

module.exports = router;

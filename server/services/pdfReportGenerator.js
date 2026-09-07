const PDFDocument = require('pdfkit');

function generateMonthlyPdfBuffer(reportData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 40,
        size: 'A4',
        bufferPages: true,
        info: {
          Title: 'UniXsport Monthly Report - ' + (reportData.monthName || ''),
          Author: 'UniXsport Sports Equipment Management System',
          Subject: 'Monthly Equipment Inventory & Activity Report'
        }
      });

      const buffers = [];
      doc.on('data', chunk => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', err => reject(err));

      const PRIMARY_COLOR = '#1e3a8a';
      const ACCENT_COLOR  = '#2563eb';
      const DARK_TEXT     = '#0f172a';
      const MUTED_TEXT    = '#475569';
      const BORDER_COLOR  = '#cbd5e1';
      const ROW_BG_LIGHT  = '#f8fafc';
      const HEADER_BG     = '#e2e8f0';

      const pageWidth = doc.page.width - 80;
      const startX = 40;

      // 1. Banner Header
      doc.rect(startX, 35, pageWidth, 55).fill(PRIMARY_COLOR);
      doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold')
         .text('UNIXSPORT SPORTS MANAGEMENT SYSTEM', startX + 15, 45);
      doc.fontSize(9.5).font('Helvetica')
         .text('Rajarata University of Sri Lanka • Official Monthly Equipment & Activity Report', startX + 15, 66);

      // Sub-header Box
      const subHeaderY = 100;
      doc.rect(startX, subHeaderY, pageWidth, 40).fillAndStroke('#f1f5f9', '#94a3b8');
      doc.fillColor(PRIMARY_COLOR).fontSize(12.5).font('Helvetica-Bold')
         .text('REPORT PERIOD: ' + (reportData.monthName || '').toUpperCase(), startX + 12, subHeaderY + 8);
      doc.fillColor(MUTED_TEXT).fontSize(8.5).font('Helvetica')
         .text('Generated On: ' + (reportData.generatedAt || '') + '   |   System: UniXsport Storekeeper Module', startX + 12, subHeaderY + 24);

      let currentY = 152;

      function ensureSpace(heightNeeded) {
        if (currentY + heightNeeded > doc.page.height - 55) {
          doc.addPage();
          currentY = 45;
          doc.fillColor(MUTED_TEXT).fontSize(8).font('Helvetica')
             .text('UniXsport Monthly Report (' + (reportData.monthName || '') + ') - Continued', startX, 25);
          doc.strokeColor(BORDER_COLOR).lineWidth(0.5)
             .moveTo(startX, 35).lineTo(startX + pageWidth, 35).stroke();
        }
      }

      function drawSectionTitle(title, iconText) {
        ensureSpace(32);
        doc.rect(startX, currentY, pageWidth, 19).fill(ACCENT_COLOR);
        doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
           .text((iconText ? iconText + ' ' : '') + title, startX + 8, currentY + 5);
        currentY += 24;
      }

      // 2. Storekeeper Info & Monthly Summary (Side by Side)
      ensureSpace(115);
      const colWidth = (pageWidth - 10) / 2;
      const leftColX = startX;
      const rightColX = startX + colWidth + 10;

      // Left Box
      doc.rect(leftColX, currentY, colWidth, 98).fillAndStroke(ROW_BG_LIGHT, BORDER_COLOR);
      doc.rect(leftColX, currentY, colWidth, 18).fill('#334155');
      doc.fillColor('#ffffff').fontSize(8.5).font('Helvetica-Bold')
         .text('STOREKEEPER / OFFICER INFO', leftColX + 8, currentY + 4);

      let skY = currentY + 23;
      const sk = reportData.storekeeper || {};
      const skFields = [
        ['Storekeeper ID', sk.id || 'US004'],
        ['Officer Name', sk.name || 'Storekeeper'],
        ['Email Address', sk.email || 'store@unixsport.edu'],
        ['Department', sk.department || 'Sports Department'],
        ['Account Role', (sk.role || 'storekeeper').toUpperCase()]
      ];
      skFields.forEach(([lbl, val]) => {
        doc.fillColor(MUTED_TEXT).fontSize(7.5).font('Helvetica-Bold').text(lbl + ':', leftColX + 8, skY, { width: 75 });
        doc.fillColor(DARK_TEXT).fontSize(7.5).font('Helvetica').text(String(val), leftColX + 85, skY, { width: colWidth - 90 });
        skY += 14;
      });

      // Right Box
      const sum = reportData.summary || {};
      doc.rect(rightColX, currentY, colWidth, 98).fillAndStroke(ROW_BG_LIGHT, BORDER_COLOR);
      doc.rect(rightColX, currentY, colWidth, 18).fill('#334155');
      doc.fillColor('#ffffff').fontSize(8.5).font('Helvetica-Bold')
         .text('MONTHLY SUMMARY STATISTICS', rightColX + 8, currentY + 4);

      let sumY = currentY + 23;
      const sumFields = [
        ['Total Issued Items (Qty)', (sum.totalIssuedQty || 0) + ' units'],
        ['Total Returned Items (Qty)', (sum.totalReturnedQty || 0) + ' units'],
        ['Borrow Transactions', (sum.totalBorrowTx || 0) + ' events'],
        ['Return Transactions', (sum.totalReturnTx || 0) + ' events'],
        ['Currently Active Borrowed', (sum.activeIssuedQty || 0) + ' units']
      ];
      sumFields.forEach(([lbl, val]) => {
        doc.fillColor(MUTED_TEXT).fontSize(7.5).font('Helvetica-Bold').text(lbl + ':', rightColX + 8, sumY, { width: 130 });
        doc.fillColor(PRIMARY_COLOR).fontSize(8).font('Helvetica-Bold').text(String(val), rightColX + 140, sumY, { width: colWidth - 146, align: 'right' });
        sumY += 14;
      });
      currentY += 108;

      function drawTable(columns, rows, rowExtractor, emptyMessage) {
        const rowHeight = 15;
        const headerHeight = 17;
        ensureSpace(headerHeight + (rows.length === 0 ? 22 : rows.length * rowHeight));
        let colX = startX;
        doc.rect(startX, currentY, pageWidth, headerHeight).fill(HEADER_BG);
        columns.forEach(col => {
          doc.fillColor(PRIMARY_COLOR).fontSize(7.5).font('Helvetica-Bold')
             .text(col.label, colX + 3, currentY + 4, { width: col.width - 6, align: col.align || 'left' });
          colX += col.width;
        });
        currentY += headerHeight;
        if (!rows || rows.length === 0) {
          doc.rect(startX, currentY, pageWidth, 20).fillAndStroke(ROW_BG_LIGHT, BORDER_COLOR);
          doc.fillColor(MUTED_TEXT).fontSize(7.5).font('Helvetica-Oblique')
             .text(emptyMessage, startX + 10, currentY + 5, { width: pageWidth - 20, align: 'center' });
          currentY += 25;
          return;
        }
        rows.forEach((rowItem, idx) => {
          ensureSpace(rowHeight + 3);
          const isEven = (idx % 2 === 0);
          doc.rect(startX, currentY, pageWidth, rowHeight).fill(isEven ? '#ffffff' : ROW_BG_LIGHT);
          const values = rowExtractor(rowItem);
          let cellX = startX;
          columns.forEach((col, cIdx) => {
            const val = String(values[cIdx] !== undefined ? values[cIdx] : '--');
            docInstance = doc;
            doc.fillColor(DARK_TEXT).fontSize(7.5).font('Helvetica')
               .text(val, cellX + 3, currentY + 3.5, {
                 width: col.width - 6,
                 align: col.align || 'left',
                 ellipsis: true
               });
            cellX += col.width;
          });
          doc.strokeColor(BORDER_COLOR).lineWidth(0.3)
             .moveTo(startX, currentY + rowHeight).lineTo(startX + pageWidth, currentY + rowHeight).stroke();
          currentY += rowHeight;
        });
        currentY += 10;
      }

      function formatDateStr(dateVal) {
        if (!dateVal) return '--';
        try {
          const d = new Date(dateVal);
          if (isNaN(d.getTime())) return String(dateVal);
          return d.toISOString().replace('T', ' ').slice(0, 16);
        } catch (e) { return String(dateVal); }
      }

      // 3. Equipment Availability
      drawSectionTitle('CURRENT EQUIPMENT AVAILABILITY (LIVE INVENTORY)');
      const availCols = [
        { label: 'Equipment ID', width: 70, align: 'left' },
        { label: 'Category', width: 90, align: 'left' },
        { label: 'Equipment Item Name', width: 135, align: 'left' },
        { label: 'Room / Location', width: 100, align: 'left' },
        { label: 'Total', width: 35, align: 'center' },
        { label: 'Avail', width: 35, align: 'center' },
        { label: 'Status', width: 50, align: 'center' }
      ];
      drawTable(availCols, reportData.equipmentAvailability || [], item => [
        item.id || '--',
        item.category || 'General',
        item.name || '--',
        item.room || item.sportsRoom || 'Main Gym Hall',
        String(item.totalQty !== undefined ? item.totalQty : (item.total || 0)),
        String(item.availableQty !== undefined ? item.availableQty : (item.available || 0)),
        (item.status || 'Available').toUpperCase()
      ], 'No equipment inventory records found in database.');

      // 4. Borrow Activity
      drawSectionTitle('EQUIPMENT BORROW & RETURN ACTIVITY (' + (reportData.monthName || '').toUpperCase() + ')');
      const borrowCols = [
        { label: 'Date / Time', width: 85, align: 'left' },
        { label: 'User ID', width: 50, align: 'left' },
        { label: 'Student Name', width: 95, align: 'left' },
        { label: 'Equipment Item', width: 105, align: 'left' },
        { label: 'Qty', width: 30, align: 'center' },
        { label: 'Returned', width: 45, align: 'center' },
        { label: 'Issued By', width: 55, align: 'left' },
        { label: 'Status', width: 50, align: 'center' }
      ];
      drawTable(borrowCols, reportData.borrowActivity || [], item => [
        formatDateStr(item.issuedAt || item.date),
        item.user_id || item.studentId || '--',
        item.studentName || '--',
        item.equipmentName || item.equipment || '--',
        String(item.qty || item.quantity || 1),
        String(item.returnedQty !== undefined ? item.returnedQty : (item.status === 'returned' ? (item.qty || 1) : 0)),
        item.issuedBy || 'Storekeeper',
        (item.status || 'Active').toUpperCase()
      ], 'No borrowing or return transactions were recorded during this month.');

      // 5. RFID Tag Assignments
      drawSectionTitle('RFID TAG ASSIGNMENT ACTIVITY (' + (reportData.monthName || '').toUpperCase() + ')');
      const rfidCols = [
        { label: 'Date / Time', width: 95, align: 'left' },
        { label: 'User / Item ID', width: 75, align: 'left' },
        { label: 'Holder Name / Category', width: 135, align: 'left' },
        { label: 'RFID Tag UID', width: 110, align: 'left' },
        { label: 'Entity Type', width: 55, align: 'center' },
        { label: 'Status', width: 45, align: 'center' }
      ];
      drawTable(rfidCols, reportData.rfidAssignments || [], item => [
        formatDateStr(item.date || item.createdAt || item.assignedAt),
        item.id || item.user_id || '--',
        item.name || item.studentName || '--',
        item.rfidTag || item.tag || '--',
        (item.type || 'Student').toUpperCase(),
        'BOUND'
      ], 'No RFID tag assignments were recorded during this month.');

      // 6. Notices / Announcements
      drawSectionTitle('MONTHLY SYSTEM NOTIFICATIONS & ACTIVITY (' + (reportData.monthName || '').toUpperCase() + ')');
      const noticeCols = [
        { label: 'Date / Time', width: 85, align: 'left' },
        { label: 'Title / Subject', width: 145, align: 'left' },
        { label: 'Target Group', width: 70, align: 'left' },
        { label: 'Priority', width: 55, align: 'center' },
        { label: 'Created By', width: 160, align: 'left' }
      ];
      drawTable(noticeCols, reportData.noticesActivity || [], item => [
        formatDateStr(item.createdAt || item.date),
        item.title || '--',
        (item.visibleTo || 'All').toUpperCase(),
        (item.priority || 'Normal').toUpperCase(),
        item.createdBy || 'Sports Directorate'
      ], 'No administrative announcements recorded during this month.');

      // 7. Signatures
      ensureSpace(80);
      currentY += 8;
      doc.strokeColor(BORDER_COLOR).lineWidth(0.8).moveTo(startX, currentY).lineTo(startX + pageWidth, currentY).stroke();
      currentY += 14;
      const sigWidth = 200;
      doc.fillColor(DARK_TEXT).fontSize(8).font('Helvetica-Bold')
         .text('Storekeeper / Officer-in-Charge:', startX, currentY);
      doc.text('Sports Director / Department Head:', startX + pageWidth - sigWidth, currentY);
      currentY += 28;
      doc.strokeColor('#64748b').lineWidth(0.8)
         .moveTo(startX, currentY).lineTo(startX + 180, currentY).stroke();
      doc.moveTo(startX + pageWidth - sigWidth, currentY).lineTo(startX + pageWidth - sigWidth + 180, currentY).stroke();
      currentY += 6;
      doc.fillColor(MUTED_TEXT).fontSize(7.5).font('Helvetica')
         .text('Signature & Date Stamp', startX, currentY);
      doc.text('Signature & Official Seal', startX + pageWidth - sigWidth, currentY);

      // 8. Footer Page Numbers
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.strokeColor(BORDER_COLOR).lineWidth(0.5)
           .moveTo(startX, doc.page.height - 35).lineTo(startX + pageWidth, doc.page.height - 35).stroke();
        doc.fillColor(MUTED_TEXT).fontSize(7.5).font('Helvetica')
           .text('UniXsport • Official Monthly Report: ' + (reportData.monthName || '') + ' | Storekeeper ID: ' + (sk.id || 'US004'), startX, doc.page.height - 25, { width: 340 });
        doc.text('Page ' + (i + 1) + ' of ' + range.count, startX + pageWidth - 100, doc.page.height - 25, { width: 100, align: 'right' });
      }

      doc.end();
    } catch (err) { reject(err); }
  });
}

module.exports = { generateMonthlyPdfBuffer };

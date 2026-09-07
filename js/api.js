/**
 * UniXsport - Local Database API Client & Persistent Data Store Layer
 */

const API_BASE_URL = (typeof window !== 'undefined' && window.location.port === '5000')
  ? ''
  : 'http://localhost:5000';

class UniXsportAPI {
  static getRoleFromContext() {
    if (typeof window === 'undefined') return '';
    const path = (window.location.pathname || '').toLowerCase();
    if (path.includes('student.html')) return 'student';
    if (path.includes('coach.html')) return 'coach';
    if (path.includes('admin.html')) return 'admin';
    if (path.includes('storekeeper.html')) return 'storekeeper';
    const storedRole = sessionStorage.getItem('userRole') || localStorage.getItem('userRole');
    return storedRole ? storedRole.toLowerCase().trim() : '';
  }

  static getToken(roleHint) {
    if (typeof window === 'undefined') return null;
    const role = (roleHint || this.getRoleFromContext() || '').toLowerCase();

    // 1. Tab-isolated session storage (highest priority for multi-user/multi-tab concurrent login)
    const tabRoleToken = role ? sessionStorage.getItem(`unixsport_token_${role}`) : null;
    if (tabRoleToken) return tabRoleToken;

    const tabToken = sessionStorage.getItem('unixsport_jwt_token') || sessionStorage.getItem('token');
    if (tabToken) return tabToken;

    // 2. Role-scoped localStorage (fallback across page reloads for specific portal)
    if (role) {
      const roleToken = localStorage.getItem(`unixsport_token_${role}`);
      if (roleToken) return roleToken;
    }

    // 3. General localStorage (ultimate fallback)
    return localStorage.getItem('unixsport_jwt_token') ||
           localStorage.getItem('token') ||
           localStorage.getItem('authToken') ||
           null;
  }

  static setToken(token, roleHint) {
    if (typeof window === 'undefined') return;
    const role = (roleHint || this.getRoleFromContext() || '').toLowerCase();

    if (token) {
      sessionStorage.setItem('unixsport_jwt_token', token);
      sessionStorage.setItem('token', token);
      if (role) {
        sessionStorage.setItem(`unixsport_token_${role}`, token);
        localStorage.setItem(`unixsport_token_${role}`, token);
      }
      localStorage.setItem('unixsport_jwt_token', token);
      localStorage.setItem('token', token);
    } else {
      sessionStorage.removeItem('unixsport_jwt_token');
      sessionStorage.removeItem('token');
      if (role) {
        sessionStorage.removeItem(`unixsport_token_${role}`);
        localStorage.removeItem(`unixsport_token_${role}`);
      }
      localStorage.removeItem('unixsport_jwt_token');
      localStorage.removeItem('token');
    }
  }

  static getUser(roleHint) {
    if (typeof window === 'undefined') return null;
    const role = (roleHint || this.getRoleFromContext() || '').toLowerCase();

    const raw = (role ? sessionStorage.getItem(`unixsport_user_${role}`) : null) ||
                sessionStorage.getItem('unixsport_user_profile') ||
                (role ? localStorage.getItem(`unixsport_user_${role}`) : null) ||
                localStorage.getItem('unixsport_user_profile');
    try {
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  static setUser(user, roleHint) {
    if (typeof window === 'undefined') return;
    const role = (roleHint || (user && user.role) || this.getRoleFromContext() || '').toLowerCase();

    if (user) {
      const str = JSON.stringify(user);
      sessionStorage.setItem('unixsport_user_profile', str);
      if (role) {
        sessionStorage.setItem(`unixsport_user_${role}`, str);
        localStorage.setItem(`unixsport_user_${role}`, str);
      }
      localStorage.setItem('unixsport_user_profile', str);
    } else {
      sessionStorage.removeItem('unixsport_user_profile');
      if (role) {
        sessionStorage.removeItem(`unixsport_user_${role}`);
        localStorage.removeItem(`unixsport_user_${role}`);
      }
      localStorage.removeItem('unixsport_user_profile');
    }
  }

  static async request(endpoint, options = {}) {
    const roleHint = options.role || this.getRoleFromContext();
    const token = this.getToken(roleHint);
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };

    // If sending FormData (file uploads), let browser set Content-Type header
    if (options.body instanceof FormData) {
      delete headers['Content-Type'];
    }

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          if (endpoint !== '/api/auth/login') {
            console.warn(`Authentication token invalid or expired for [${endpoint}].`);
          }
        }
        throw new Error(data.error || data.message || 'API request failed');
      }

      return data;
    } catch (err) {
      console.error(`[API Error] ${endpoint}:`, err.message);
      throw err;
    }
  }

  // Auth Methods
  static async login(username, password, role) {
    const data = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, role }),
      role
    });

    if (data.token) {
      const targetRole = (data.user?.role || role || '').toLowerCase();
      this.setToken(data.token, targetRole);
      this.setUser(data.user, targetRole);
    }
    return data;
  }

  static async register(studentData) {
    return await this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(studentData)
    });
  }

  static async logout() {
    const role = this.getRoleFromContext();
    try {
      await this.request('/api/auth/logout', { method: 'POST', role });
    } catch (e) {
      console.warn('Logout notification to server failed:', e.message);
    } finally {
      const currentRole = role || sessionStorage.getItem('userRole') || localStorage.getItem('userRole');
      this.setToken(null, currentRole);
      this.setUser(null, currentRole);
      sessionStorage.clear();
      if (currentRole) {
        localStorage.removeItem(`unixsport_token_${currentRole}`);
        localStorage.removeItem(`unixsport_user_${currentRole}`);
      }
      if (currentRole === 'admin') {
        window.location.replace('login.html?role=admin');
      } else {
        window.location.replace('home.html');
      }
    }
  }

  static async getProfile() {
    return await this.request('/api/auth/me');
  }

  static async changePassword(currentPassword, newPassword) {
    return await this.request('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
  }

  static async resetPassword(email, newPassword) {
    return await this.request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, newPassword })
    });
  }

  // Student Methods
  static async getStudentDashboard() {
    return await this.request('/api/student/dashboard');
  }

  static async getStudentBorrowHistory(filters = {}) {
    let url = '/api/student/borrow-history';
    const params = new URLSearchParams();
    if (filters.equipment) params.append('equipment', filters.equipment);
    if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.append('dateTo', filters.dateTo);
    if (filters.status) params.append('status', filters.status);
    const qs = params.toString();
    if (qs) url += `?${qs}`;
    return await this.request(url);
  }

  static async requestGymSchedule(date, timeSlot, coachId) {
    return await this.request('/api/student/schedule-request', {
      method: 'POST',
      body: JSON.stringify({ requestedDate: date, timeSlot, coachId })
    });
  }

  static async requestEquipment(equipmentId, qty) {
    return await this.request('/api/student/equipment-request', {
      method: 'POST',
      body: JSON.stringify({ equipmentId, qty })
    });
  }

  // Coach Methods
  static async getCoachDashboard() {
    return await this.request('/api/coach/dashboard');
  }

  static async approveScheduleRequest(formData) {
    return await this.request('/api/coach/approve-request', {
      method: 'POST',
      body: formData // FormData containing pdf file
    });
  }

  static async rejectScheduleRequest(requestId, rejectionReason) {
    return await this.request('/api/coach/reject-request', {
      method: 'POST',
      body: JSON.stringify({ requestId, rejectionReason })
    });
  }

  // Storekeeper Methods
  static async getStorekeeperDashboard() {
    return await this.request('/api/storekeeper/dashboard');
  }

  static async identifyStudent(rfidOrQuery) {
    return await this.request('/api/storekeeper/identify-student', {
      method: 'POST',
      body: JSON.stringify({ rfid: rfidOrQuery })
    });
  }

  static async issueEquipment(studentId, equipmentId, quantity) {
    return await this.request('/api/storekeeper/issue-item', {
      method: 'POST',
      body: JSON.stringify({ studentId, equipmentId, quantity })
    });
  }

  static async returnEquipment(logId, quantity = null, studentId = null, equipmentId = null) {
    return await this.request('/api/storekeeper/return-item', {
      method: 'POST',
      body: JSON.stringify({ logId, quantity, studentId, equipmentId })
    });
  }

  static async addEquipment(equipmentData) {
    return await this.request('/api/storekeeper/add-equipment', {
      method: 'POST',
      body: JSON.stringify(equipmentData)
    });
  }

  static async fetchRfidRegistry() {
    return await this.request('/api/storekeeper/rfid-registry');
  }

  static async searchStudentForRfid(userId) {
    return await this.request('/api/storekeeper/search-student', {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
  }

  static async assignStudentRfid(userId, rfidTag) {
    return await this.request('/api/storekeeper/assign-student-rfid', {
      method: 'POST',
      body: JSON.stringify({ userId, studentId: userId, studentRegNo: userId, rfidTag })
    });
  }

  static async assignEquipmentRfid(equipmentId, rfidTag) {
    return await this.request('/api/storekeeper/assign-equipment-rfid', {
      method: 'POST',
      body: JSON.stringify({ equipmentId, rfidTag })
    });
  }

  static async getMonthlyReportData(month) {
    return await this.request(`/api/storekeeper/monthly-report-data?month=${encodeURIComponent(month || '')}`);
  }

  // Admin Methods
  static async getAdminDashboard() {
    return await this.request('/api/admin/dashboard');
  }

  static async createUser(userData) {
    return await this.request('/api/admin/create-user', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  }

  static async updateUserAdmin(userId, userData) {
    return await this.request(`/api/admin/user/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(userData)
    });
  }

  static async deleteUser(userId) {
    return await this.request(`/api/admin/user/${userId}`, {
      method: 'DELETE'
    });
  }

  static async uploadAdminProfilePhoto(imageData) {
    return await this.request('/api/admin/profile-photo', {
      method: 'POST',
      body: JSON.stringify({ image: imageData })
    });
  }

  static async deleteAdminProfilePhoto() {
    return await this.request('/api/admin/profile-photo', {
      method: 'DELETE'
    });
  }

  static async updateAdminProfile(profileData) {
    return await this.request('/api/admin/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData)
    });
  }

  // Notices & Broadcast Methods (Universal)
  static async getNotices() {
    return await this.request('/api/notices');
  }

  static async createNotice(noticeData) {
    return await this.request('/api/notices', {
      method: 'POST',
      body: JSON.stringify(noticeData)
    });
  }

  static async updateNotice(noticeId, noticeData) {
    return await this.request(`/api/notices/${noticeId}`, {
      method: 'PUT',
      body: JSON.stringify(noticeData)
    });
  }

  static async deleteNotice(noticeId) {
    return await this.request(`/api/notices/${noticeId}`, {
      method: 'DELETE'
    });
  }

  static async addFacility(facilityData) {
    return await this.request('/api/admin/facility', {
      method: 'POST',
      body: JSON.stringify(facilityData)
    });
  }

  static async updateFacility(facilityId, facilityData) {
    return await this.request(`/api/admin/facility/${facilityId}`, {
      method: 'PATCH',
      body: JSON.stringify(facilityData)
    });
  }

  static async deleteFacility(facilityId) {
    return await this.request(`/api/admin/facility/${facilityId}`, {
      method: 'DELETE'
    });
  }

  static async addEquipmentAdmin(equipmentData) {
    return await this.request('/api/admin/equipment', {
      method: 'POST',
      body: JSON.stringify(equipmentData)
    });
  }

  static async updateEquipmentAdmin(equipmentId, equipmentData) {
    return await this.request(`/api/admin/equipment/${equipmentId}`, {
      method: 'PATCH',
      body: JSON.stringify(equipmentData)
    });
  }

  static async deleteEquipmentAdmin(equipmentId) {
    return await this.request(`/api/admin/equipment/${equipmentId}`, {
      method: 'DELETE'
    });
  }

  static async getEventsAdmin() {
    return await this.request('/api/admin/events');
  }

  static async createEventAdmin(eventData) {
    return await this.request('/api/admin/event', {
      method: 'POST',
      body: JSON.stringify(eventData)
    });
  }

  static async updateEventAdmin(eventId, eventData) {
    return await this.request(`/api/admin/event/${eventId}`, {
      method: 'PATCH',
      body: JSON.stringify(eventData)
    });
  }

  static async deleteEventAdmin(eventId) {
    return await this.request(`/api/admin/event/${eventId}`, {
      method: 'DELETE'
    });
  }

  // Live RFID Hardware Stream Listener
  static subscribeRfidEvents(onUserScan, onEquipmentScan, onErrorScan) {
    try {
      const eventSource = new EventSource(`${API_BASE_URL}/api/rfid/events`);

      eventSource.addEventListener('user_scan', (e) => {
        const data = JSON.parse(e.data);
        if (onUserScan) onUserScan(data);
      });

      eventSource.addEventListener('equipment_scan', (e) => {
        const data = JSON.parse(e.data);
        if (onEquipmentScan) onEquipmentScan(data);
      });

      eventSource.addEventListener('unauthorized_scan', (e) => {
        const data = JSON.parse(e.data);
        if (onErrorScan) onErrorScan(data);
      });

      return eventSource;
    } catch (e) {
      console.warn('SSE subscription failed:', e);
      return null;
    }
  }

  // Public Stats, Facilities, Events, Announcements & Contact Methods
  static async getPublicStats() {
    return await this.request('/api/public/stats');
  }

  static async getDashboardMetrics() {
    return await this.request('/api/dashboard/metrics');
  }

  static async getFacilities() {
    return await this.request('/api/public/facilities');
  }

  static async getEvents() {
    return await this.request('/api/public/events');
  }

  static async getAnnouncements() {
    return await this.request('/api/public/announcements');
  }

  static async submitContactMessage(contactData) {
    return await this.request('/api/public/contact', {
      method: 'POST',
      body: JSON.stringify(contactData)
    });
  }

  // Direct USB Serial Connection (Detects USB Plug In / Unplug Automatically)
  static async connectUsbRfid(onCardScanned, onDisconnect) {
    if (!('serial' in navigator)) {
      alert('Web Serial API is not supported by your browser. Please use Chrome, Edge, or Brave.');
      return false;
    }

    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });

      // Listen for USB device disconnect event
      const disconnectListener = () => {
        console.warn('USB Hardware Disconnected / Plugged Off');
        if (onDisconnect) onDisconnect();
        navigator.serial.removeEventListener('disconnect', disconnectListener);
      };
      navigator.serial.addEventListener('disconnect', disconnectListener);

      const textDecoder = new TextDecoderStream();
      port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();

      let buffer = '';
      (async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              console.warn('USB Stream Ended (Hardware Unplugged)');
              if (onDisconnect) onDisconnect();
              break;
            }
            if (value) {
              buffer += value;
              const lines = buffer.split('\n');
              buffer = lines.pop();
              for (let line of lines) {
                const clean = line.trim().toUpperCase();
                if (clean) {
                  const match = clean.match(/(?:UID:?|SCANNED RFID UID:?)\s*([A-F0-9\s]{4,})/i) || [null, clean];
                  const uid = match[1].replace(/\s+/g, '');
                  if (uid && uid.length >= 4 && onCardScanned) {
                    onCardScanned(uid);
                  }
                }
              }
            }
          }
        } catch (err) {
          console.warn('USB Hardware Unplugged:', err.message);
          if (onDisconnect) onDisconnect();
        }
      })();

      return true;
    } catch (err) {
      console.error('USB Serial connection error:', err.message);
      return false;
    }
  }

  // Wireless Bluetooth Connection (BluetoothSerial Classic & BLE)
  static async connectBluetoothRfid(onCardScanned) {
    if (!('bluetooth' in navigator) && !('serial' in navigator)) {
      alert('Bluetooth / Serial API is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Brave.');
      return false;
    }

    // 1. First try Classic ESP32 BluetoothSerial via Virtual Serial COM Port (Windows/Mac)
    if ('serial' in navigator) {
      try {
        const connected = await this.connectUsbRfid(onCardScanned);
        if (connected) return true;
      } catch (e) {
        console.warn('Bluetooth Serial Port selection cancelled or failed:', e.message);
      }
    }

    // 2. Try Web Bluetooth GATT API (BLE Mode)
    if ('bluetooth' in navigator) {
      try {
        const device = await navigator.bluetooth.requestDevice({
          filters: [
            { namePrefix: 'UniXsport' },
            { namePrefix: 'ESP32' }
          ],
          optionalServices: [
            '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
            '00001101-0000-1000-8000-00805f9b34fb',
            '0000ffe0-0000-1000-8000-00805f9b34fb'
          ]
        });

        const server = await device.gatt.connect();
        const services = await server.getPrimaryServices();

        if (services.length > 0) {
          const service = services[0];
          const characteristics = await service.getCharacteristics();
          const rxChar = characteristics.find(c => c.properties.notify || c.properties.indicate);

          if (rxChar) {
            await rxChar.startNotifications();
            rxChar.addEventListener('characteristicvaluechanged', (e) => {
              const decoder = new TextDecoder('utf-8');
              const text = decoder.decode(e.target.value).trim().toUpperCase();
              const match = text.match(/(?:UID:?|SCANNED RFID UID:?)\s*([A-F0-9\s]{4,})/i) || [null, text];
              const uid = match[1].replace(/\s+/g, '');
              if (uid && uid.length >= 4 && onCardScanned) {
                onCardScanned(uid);
              }
            });
            return true;
          }
        }
      } catch (bleErr) {
        console.warn('GATT BLE connection attempt ended:', bleErr.message);
      }
    }

    return false;
  }
}

window.UniXsportAPI = UniXsportAPI;

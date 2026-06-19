/**
 * Database Module - localStorage with auto-sync to local JSON file
 *
 * How it works:
 *   - localStorage is the fast, synchronous in-memory store (all existing code works unchanged).
 *   - Uses the File System Access API (where supported) to auto-save to a database.json file.
 *   - Falls back to manual Export/Import for browsers without File System Access API.
 *   - On startup, if a file handle is saved, data is loaded from the file automatically.
 */
const DB = {
  // File handle for auto-save (File System Access API)
  _fileHandle: null,
  _saveTimeout: null,
  _autoSaveEnabled: false,

  // Helpers to get/set JSON from localStorage
  _get: (key) => JSON.parse(localStorage.getItem(key)),
  _set: function (key, val) {
    localStorage.setItem(key, JSON.stringify(val));
    // Sync to MySQL backend server
    this._syncToServer(key, val);
    // Trigger debounced auto-save to file
    this._debouncedSave();
  },

  // Sync a single table to the MySQL backend server
  _syncToServer: async function (key, val) {
    const keyMap = {
      'db_users': 'users',
      'db_settings': 'settings',
      'db_employees': 'employees',
      'db_notifications_log': 'notifications_log',
      'db_change_log': 'change_log'
    };
    const table = keyMap[key];
    if (!table) return;

    try {
      const response = await fetch(`/api/db/${table}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(val)
      });
      if (response.ok) {
        console.log(`[DB] ✅ Synced ${table} to MySQL server.`);
        this._updateSyncStatus('server-saved');
      } else {
        console.warn(`[DB] ❌ Server rejected sync for ${table}.`);
        this._updateSyncStatus('error');
      }
    } catch (err) {
      console.warn(`[DB] Network error syncing ${table} to server:`, err.message);
      this._updateSyncStatus('error');
    }
  },

  // Sync entire database to the MySQL backend server
  _syncAllToServer: async function (data) {
    try {
      const response = await fetch('/api/db', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (response.ok) {
        console.log('[DB] ✅ Synced entire database backup to MySQL server.');
        this._updateSyncStatus('server-saved');
        return true;
      } else {
        console.warn('[DB] ❌ Server rejected entire database sync.');
        this._updateSyncStatus('error');
        return false;
      }
    } catch (err) {
      console.warn('[DB] Network error syncing database to server:', err.message);
      this._updateSyncStatus('error');
      return false;
    }
  },

  // Debounced save — waits 500ms after last change to avoid excessive writes
  _debouncedSave: function () {
    if (!this._autoSaveEnabled || !this._fileHandle) return;
    clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(() => {
      this._saveToFile();
    }, 500);
  },

  // Save all data to the connected file
  _saveToFile: async function () {
    if (!this._fileHandle) return;
    try {
      const data = this._getAllData();
      const writable = await this._fileHandle.createWritable();
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();
      this._updateSyncStatus('saved');
    } catch (err) {
      console.warn('[DB] Auto-save failed:', err.message);
      this._updateSyncStatus('error');
    }
  },

  // Get all data as a single object
  _getAllData: function () {
    return {
      users: this._get('db_users') || [],
      settings: this._get('db_settings') || {},
      employees: this._get('db_employees') || [],
      notifications_log: this._get('db_notifications_log') || [],
      change_log: this._get('db_change_log') || []
    };
  },

  // Load data from a JSON object into localStorage
  _loadData: function (data) {
    if (data.users) localStorage.setItem('db_users', JSON.stringify(data.users));
    if (data.settings) localStorage.setItem('db_settings', JSON.stringify(data.settings));
    if (data.employees) localStorage.setItem('db_employees', JSON.stringify(data.employees));
    if (data.notifications_log) localStorage.setItem('db_notifications_log', JSON.stringify(data.notifications_log));
    if (data.change_log) localStorage.setItem('db_change_log', JSON.stringify(data.change_log));
  },

  // Connect to a file for auto-save (File System Access API)
  connectToFile: async function () {
    if (!window.showSaveFilePicker) {
      alert('Your browser does not support the File System Access API.\nPlease use Chrome, Edge, or Opera.\n\nYou can still use Export/Import from the Settings page.');
      return false;
    }

    try {
      this._fileHandle = await window.showSaveFilePicker({
        suggestedName: 'database.json',
        types: [{
          description: 'JSON Database',
          accept: { 'application/json': ['.json'] }
        }]
      });
      this._autoSaveEnabled = true;
      // Save immediately
      await this._saveToFile();
      this._updateSyncStatus('connected');
      console.log('[DB] ✅ Connected to file for auto-save');
      return true;
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('[DB] File connection failed:', err.message);
      }
      return false;
    }
  },

  // Load from a file (File System Access API)
  loadFromFile: async function () {
    if (!window.showOpenFilePicker) {
      // Fallback: use regular file input
      return this._loadFromFileInput();
    }

    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{
          description: 'JSON Database',
          accept: { 'application/json': ['.json'] }
        }]
      });
      const file = await handle.getFile();
      const text = await file.text();
      const data = JSON.parse(text);

      this._loadData(data);
      await this._syncAllToServer(data);
      this._fileHandle = handle;
      this._autoSaveEnabled = true;
      this._updateSyncStatus('server-connected');
      console.log('[DB] ✅ Loaded data from file and synced to MySQL server');

      // Refresh UI
      window.dispatchEvent(new CustomEvent('db-synced'));
      return true;
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('[DB] File load failed:', err.message);
        alert('Failed to load file: ' + err.message);
      }
      return false;
    }
  },

  // Fallback file input loader
  _loadFromFileInput: function () {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) { resolve(false); return; }
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const data = JSON.parse(evt.target.result);
            this._loadData(data);
            this._syncAllToServer(data).then(() => {
              window.dispatchEvent(new CustomEvent('db-synced'));
              resolve(true);
            });
          } catch (err) {
            alert('Failed to parse JSON file: ' + err.message);
            resolve(false);
          }
        };
        reader.readAsText(file);
      };
      input.click();
    });
  },

  // Quick download (no File System Access API needed)
  downloadSnapshot: function () {
    const data = this._getAllData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'database.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // Update the sync status indicator in the UI
  _updateSyncStatus: function (status) {
    const indicator = document.getElementById('db-sync-status');
    if (!indicator) return;
    switch (status) {
      case 'server-connected':
        indicator.innerHTML = '<i data-lucide="database" style="width:14px;"></i> <span>MySQL Connected</span>';
        indicator.className = 'sync-status sync-connected';
        break;
      case 'server-saved':
        indicator.innerHTML = '<i data-lucide="check-circle" style="width:14px;"></i> <span>MySQL Saved</span>';
        indicator.className = 'sync-status sync-saved';
        // Reset to connected after 2s
        setTimeout(() => this._updateSyncStatus('server-connected'), 2000);
        break;
      case 'connected':
        indicator.innerHTML = '<i data-lucide="hard-drive" style="width:14px;"></i> <span>File Connected</span>';
        indicator.className = 'sync-status sync-connected';
        break;
      case 'saved':
        indicator.innerHTML = '<i data-lucide="check-circle" style="width:14px;"></i> <span>Saved</span>';
        indicator.className = 'sync-status sync-saved';
        // Reset to connected after 2s
        setTimeout(() => this._updateSyncStatus('connected'), 2000);
        break;
      case 'error':
        indicator.innerHTML = '<i data-lucide="alert-circle" style="width:14px;"></i> <span>Save Error</span>';
        indicator.className = 'sync-status sync-error';
        break;
      default:
        indicator.innerHTML = '<i data-lucide="cloud-off" style="width:14px;"></i> <span>Offline Mode</span>';
        indicator.className = 'sync-status sync-disconnected';
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
  },

  init: async function () {
    // Try to load state from MySQL server on startup
    try {
      const response = await fetch('/api/db');
      if (response.ok) {
        const data = await response.json();
        this._loadData(data);
        console.log('[DB] ✅ Successfully loaded and synchronized data from MySQL server.');
        this._updateSyncStatus('server-connected');
        window.dispatchEvent(new CustomEvent('db-synced'));
        return;
      }
      throw new Error('Database server returned status code ' + response.status);
    } catch (err) {
      console.warn('[DB] MySQL server fetch failed. Using local storage cache fallback:', err.message);
      this._updateSyncStatus('disconnected');
    }

    // 1. Initialize Users Table
    if (!localStorage.getItem('db_users')) {
      const defaultUsers = [
        {
          id: 'u_super',
          email: 'superadmin@system.com',
          name: 'Super Administrator',
          password: 'superadmin123',
          role: 'superadmin'
        }
      ];
      this._set('db_users', defaultUsers);
    }

    // 2. Initialize Settings Table
    if (!localStorage.getItem('db_settings')) {
      const defaultSettings = {
        warningDays: 30,
        criticalDays: 7,
        defaultEmails: 'manager1@system.com, safety@system.com',
        defaultWhatsapp: '+60123456789, +60198765432'
      };
      this._set('db_settings', defaultSettings);
    }

    // Initialize change log for audit trails
    if (!localStorage.getItem('db_change_log')) {
      this._set('db_change_log', []);
    }

    // 3. Initialize Notifications Log
    if (!localStorage.getItem('db_notifications_log')) {
      this._set('db_notifications_log', []);
    }

    // 4. Initialize Employees Table
    if (!localStorage.getItem('db_employees')) {
      const today = new Date();

      const addDays = (days) => {
        const d = new Date(today);
        d.setDate(today.getDate() + days);
        return d.toISOString().split('T')[0];
      };

      /*const defaultEmployees = [
        {
          id: 'emp_1',
          ql: addDays(80),
          name: 'Ahmad bin Sulaiman',
          passportNo: 'A12345678',
          passportExpiry: addDays(45),
          medicalExpiry: addDays(12),
          insuranceExpiry: addDays(200),
          employmentPassExpiry: addDays(-5),
          tanaExpiry: addDays(90),
          greenIcExpiry: '',
          remarks: 'Needs pass renewal urgently. Insurance is up-to-date.',
          contacts: {
            emails: ['ahmad.sulaiman@gmail.com'],
            whatsappNumbers: ['+601122334455']
          }
        },
        {
          id: 'emp_2',
          ql: addDays(10),
          name: 'Chong Wei Ming',
          passportNo: 'B87654321',
          passportExpiry: addDays(15),
          medicalExpiry: addDays(60),
          insuranceExpiry: addDays(150),
          employmentPassExpiry: addDays(25),
          tanaExpiry: '',
          greenIcExpiry: addDays(300),
          remarks: 'Passport renewal in progress.',
          contacts: {
            emails: ['weiming.chong@yahoo.com'],
            whatsappNumbers: ['+60177788990']
          }
        },
        {
          id: 'emp_3',
          ql: addDays(-8),
          name: 'Karthik Muthusamy',
          passportNo: 'C45678912',
          passportExpiry: addDays(120),
          medicalExpiry: addDays(-2),
          insuranceExpiry: addDays(15),
          employmentPassExpiry: addDays(80),
          tanaExpiry: addDays(-10),
          greenIcExpiry: addDays(400),
          remarks: 'Medical checkup scheduled next Tuesday.',
          contacts: {
            emails: ['karthik.m@hotmail.com'],
            whatsappNumbers: ['+60199887766']
          }
        },
        {
          id: 'emp_4',
          ql: addDays(300),
          name: 'Sarah Jenkins',
          passportNo: 'D98761234',
          passportExpiry: addDays(350),
          medicalExpiry: addDays(350),
          insuranceExpiry: addDays(350),
          employmentPassExpiry: addDays(350),
          tanaExpiry: '',
          greenIcExpiry: '',
          remarks: 'Newly onboarded foreign specialist.',
          contacts: {
            emails: ['sarah.j@company.com'],
            whatsappNumbers: ['+60134567890']
          }
        },
        {
          id: 'emp_5',
          ql: '',
          name: 'Nurul Izzah binti Rosli',
          passportNo: 'E23456789',
          passportExpiry: addDays(-15),
          medicalExpiry: addDays(180),
          insuranceExpiry: addDays(180),
          employmentPassExpiry: '',
          tanaExpiry: '',
          greenIcExpiry: '',
          remarks: 'Currently on parental leave.',
          contacts: {
            emails: ['nurul.izzah@company.com'],
            whatsappNumbers: ['+60122334455']
          }
        }
      ];*/
      this._set('db_employees', defaultEmployees);
    }
  },

  // --- Auth Operations ---
  login: function (email, password) {
    const users = this._get('db_users') || [];
    console.log('Attempting login with email:', email);
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    if (user) {
      const sessionUser = { id: user.id, email: user.email, name: user.name, role: user.role };
      sessionStorage.setItem('current_user', JSON.stringify(sessionUser));
      return { success: true, user: sessionUser };
    }
    console.warn('Login failed – user not found or password mismatch.');
    return { success: false, message: 'Invalid email or password.' };
  },

  getCurrentUser: function () {
    return JSON.parse(sessionStorage.getItem('current_user'));
  },

  logout: function () {
    sessionStorage.removeItem('current_user');
  },

  // --- Admin Account CRUD (Superadmin only) ---
  getAdmins: function () {
    const users = this._get('db_users') || [];
    return users.filter(u => u.role === 'admin');
  },

  saveAdmin: function (adminData) {
    const users = this._get('db_users') || [];
    if (!adminData.email || !adminData.password || !adminData.name) {
      return { success: false, message: 'All fields are required.' };
    }

    const exists = users.find(u => u.email.toLowerCase() === adminData.email.toLowerCase() && u.id !== adminData.id);
    if (exists) {
      return { success: false, message: 'Email address is already in use.' };
    }

    if (adminData.id) {
      const index = users.findIndex(u => u.id === adminData.id);
      if (index !== -1) {
        users[index] = { ...users[index], ...adminData };
      }
    } else {
      adminData.id = 'u_' + Date.now();
      adminData.role = 'admin';
      users.push(adminData);
      this._set('db_users', users);
      this.logChange('saveAdmin', { admin: adminData });
      return { success: true, message: 'Account saved successfully!' };
    }

  },

  deleteAdmin: function (adminId) {
    let users = this._get('db_users') || [];
    users = users.filter(u => u.id !== adminId);
    this._set('db_users', users);
    this.logChange('deleteAdmin', { adminId });
    alert("Admin account deleted successfully!");
  },

  // Clear all data except superadmin user
  clearAllExceptSuperadmin: function () {
    const users = this._get('db_users') || [];
    let superadmin = users.filter(u => u.role === 'superadmin');
    if (superadmin.length === 0) {
      superadmin = [{
        id: 'u_super',
        email: 'superadmin@system.com',
        name: 'Super Administrator',
        password: 'superadmin123',
        role: 'superadmin'
      }];
    }
    this._set('db_users', superadmin);
    this._set('db_employees', []);
    this._set('db_notifications_log', []);
    this.logChange('clearAllExceptSuperadmin', {});
    return { success: true };
  },

  // --- Settings Operations ---
  getSettings: function () {
    return this._get('db_settings');
  },

  saveSettings: function (settingsData) {
    const current = this.getSettings();
    const updated = { ...current, ...settingsData };
    this._set('db_settings', updated);
    this.logChange('saveSettings', { updated });
  },

  // --- Employee operations (Admin/Superadmin) ---
  // Search employees by employer name (case-insensitive)
  searchEmployeesByEmployer: function (searchTerm) {
    const term = searchTerm ? searchTerm.toLowerCase() : '';
    // Filter localStorage data first
    const employees = this.getEmployees();
    const filtered = employees.filter(e => e.employers && e.employers.toLowerCase().includes(term));
    if (filtered.length) return filtered;
    // Fallback to MySQL query if no local results or to ensure fresh data
    // Note: using LIKE for partial match, escaping %
    const sql = `SELECT * FROM employees WHERE LOWER(employers) LIKE ?`;
    const param = `%${term}%`;
    // This returns a promise; callers should handle async.
    return this.query(sql, [param]);
  },

  getEmployeeById: function (id) {
    const employees = this.getEmployees();
    return employees.find(e => e.id === id);
  },

  saveEmployee: function (employeeData) {
    const employees = this.getEmployees();
    if (!employeeData.name || !employeeData.passportNo) {
      return { success: false, message: 'Name and Passport No are required.' };
    }

    // Ensure employers and employerContact fields exist (default empty strings)
    if (!employeeData.employers) {
      employeeData.employers = '';
    }
    if (!employeeData.employerContact) {
      employeeData.employerContact = '';
    }

    if (employeeData.id) {
      const index = employees.findIndex(e => e.id === employeeData.id);
      if (index !== -1) {
        // Preserve existing employers if not provided in update
        const existingEmp = employees[index];
        employees[index] = {
          ...existingEmp,
          ...employeeData,
          employers: employeeData.employers || existingEmp.employers,
          employerContact: employeeData.employerContact || existingEmp.employerContact
        };
      } else {
        return { success: false, message: 'Employee not found.' };
      }
    } else {
      employeeData.id = 'emp_' + Date.now();
      // Ensure default employers and employerContact fields for new entries
      employeeData.employers = employeeData.employers || '';
      employeeData.employerContact = employeeData.employerContact || '';
      employees.push(employeeData);
    }

    this._set('db_employees', employees);
    this.logChange('saveEmployee', { employee: employeeData });
  },

  deleteEmployee: function (id) {
    let employees = this.getEmployees();
    employees = employees.filter(e => e.id !== id);
    this._set('db_employees', employees);
    this.logChange('deleteEmployee', { id });
  },

  // Bulk Import with duplicate checks
  bulkImportEmployees: function (newEmployees) {
    const existing = this.getEmployees();
    let updatedCount = 0;
    let addedCount = 0;

    newEmployees.forEach(newEmp => {
      const existingIdx = existing.findIndex(e => e.passportNo.trim().toLowerCase() === newEmp.passportNo.trim().toLowerCase());
      if (existingIdx !== -1) {
        // Preserve existing employers and employerContact if not provided in import
        const existingEmp = existing[existingIdx];
        existing[existingIdx] = {
          ...existingEmp,
          ...newEmp,
          employers: newEmp.employers || existingEmp.employers,
          employerContact: newEmp.employerContact || existingEmp.employerContact,
          contacts: {
            emails: newEmp.contacts?.emails?.length ? newEmp.contacts.emails : existingEmp.contacts.emails,
            whatsappNumbers: newEmp.contacts?.whatsappNumbers?.length ? newEmp.contacts.whatsappNumbers : existingEmp.contacts.whatsappNumbers
          }
        };
        updatedCount++;
      } else {
        newEmp.id = 'emp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        // Ensure employers and employerContact fields exist for new entries
        newEmp.employers = newEmp.employers || '';
        newEmp.employerContact = newEmp.employerContact || '';
        if (!newEmp.contacts) {
          newEmp.contacts = { emails: [], whatsappNumbers: [] };
        }
        existing.push(newEmp);
        addedCount++;
      }
    });

    this._set('db_employees', existing);
    this.logChange('bulkImportEmployees', { added: addedCount, updated: updatedCount });
    return { success: true, added: addedCount, updated: updatedCount };
  },

  // --- Notification Logs ---
  getNotificationsLog: function () {
    return this._get('db_notifications_log') || [];
  },

  logNotification: function (logEntry) {
    const logs = this.getNotificationsLog();
    logEntry.id = 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    logEntry.sentAt = new Date().toISOString();
    logs.unshift(logEntry);
    this._set('db_notifications_log', logs);
    return logEntry;
  },

  // Export full database to JSON file (legacy backup)
  exportBackup: function () {
    const data = {
      users: this._get('db_users'),
      settings: this._get('db_settings'),
      employees: this._get('db_employees'),
      notifications_log: this._get('db_notifications_log')
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expiration_tracker_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // Import full database from JSON file (legacy restore)
  importBackup: async function (jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.users && data.settings && data.employees && data.notifications_log) {
        this._loadData(data);
        const success = await this._syncAllToServer(data);
        return { success };
      }
      return { success: false, message: 'Invalid backup file structure.' };
    } catch (e) {
      return { success: false, message: 'Failed to parse JSON backup file.' };
    }
  }
};

// Initialize DB tables
DB.init();

// --- Audit Log ---
DB.logChange = function (action, details) {
  const log = DB._get('db_change_log') || [];
  const currentUser = DB.getCurrentUser();
  const entry = {
    timestamp: new Date().toISOString(),
    user: currentUser ? currentUser.email : 'system',
    action: action,
    details: details || {}
  };
  log.push(entry);
  DB._set('db_change_log', log);

  // Show browser notification on change
  if (typeof Notifications !== 'undefined' && Notifications.sendBrowserNotification) {
    let detailMsg = '';
    if (action === 'saveEmployee') {
      detailMsg = `Employee "${details.employee.name}" saved.`;
    } else if (action === 'deleteEmployee') {
      detailMsg = `Employee deleted (ID: ${details.id}).`;
    } else if (action === 'saveSettings') {
      detailMsg = `System configuration thresholds updated.`;
    } else if (action === 'saveAdmin') {
      detailMsg = `Admin account "${details.admin.name}" saved.`;
    } else if (action === 'deleteAdmin') {
      detailMsg = `Admin account deleted (ID: ${details.adminId}).`;
    } else if (action === 'bulkImportEmployees') {
      detailMsg = `Bulk import complete: Added ${details.added}, Updated ${details.updated}.`;
    } else if (action === 'clearAllExceptSuperadmin') {
      detailMsg = `Database reset completed.`;
    } else {
      detailMsg = `Action: ${action}`;
    }

    Notifications.sendBrowserNotification('System Change Detected', `${detailMsg} (by ${entry.user})`);
  }

  return entry;
};

window.DB = DB; // expose to window scope

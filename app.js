/**
 * App Module - Core frontend application controller
 */
const App = {
  currentUser: null,
  currentView: 'login',
  employees: [],
  filteredEmployees: [],
  currentPage: 1,
  rowsPerPage: 10,
  selectedEmployeeId: null,
  selectedLogId: null,
  statusChart: null,
  typeChart: null,

  init: function () {
    this.initTheme();
    this.checkSession();
    this.bindEvents();
    this.initLucide();
    this.requestNotificationPermission();
  },

  requestNotificationPermission: function () {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  },

  checkSession: function () {
    const user = DB.getCurrentUser();
    if (user) {
      this.currentUser = user;
      // Redirect to appropriate view based on role
      this.switchView(user.role === 'superadmin' ? 'superadmin' : 'dashboard');
      this.updateUserProfileUI();
    } else {
      this.switchView('login');
    }
  },

  initLucide: function () {
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },

  initTheme: function () {
    const savedTheme = localStorage.getItem('theme_preference') || 'dark';
    const btn = document.getElementById('btn-theme-toggle');

    if (savedTheme === 'light') {
      document.body.classList.add('theme-light');
      if (btn) {
        btn.innerHTML = `<i data-lucide="moon"></i> <span>Dark Mode</span>`;
      }
    } else {
      document.body.classList.remove('theme-light');
      if (btn) {
        btn.innerHTML = `<i data-lucide="sun"></i> <span>Light Mode</span>`;
      }
    }
  },

  switchView: function (viewId) {
    this.currentView = viewId;

    // Toggle view elements
    document.querySelectorAll('.view-section').forEach(section => {
      section.classList.remove('active');
    });

    const activeSection = document.getElementById(`view-${viewId}`);
    if (activeSection) {
      activeSection.classList.add('active');
    }

    // Toggle sidebar visibility
    const sidebar = document.getElementById('app-sidebar');
    if (viewId === 'login') {
      sidebar.classList.add('d-none');
    } else {
      sidebar.classList.remove('d-none');

      // Update active menu highlights
      document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.view === viewId) {
          item.classList.add('active');
        }
      });

      // Filter sidebar menu items depending on role
      const adminOnlyItems = document.querySelectorAll('.admin-only');
      const superadminOnlyItems = document.querySelectorAll('.superadmin-only');

      if (this.currentUser.role === 'superadmin') {
        adminOnlyItems.forEach(el => el.classList.remove('d-none'));
        superadminOnlyItems.forEach(el => el.classList.remove('d-none'));
      } else {
        adminOnlyItems.forEach(el => el.classList.remove('d-none'));
        superadminOnlyItems.forEach(el => el.classList.add('d-none'));
      }
    }

    // Handle view-specific initializations
    if (viewId === 'dashboard') {
      this.loadDashboardData();
    } else if (viewId === 'superadmin') {
      this.loadSuperadminData();
    } else if (viewId === 'outbox') {
      this.loadOutboxData();
    } else if (viewId === 'alerts') {
      this.loadAlertsData();
    }

    // Refresh icons
    this.initLucide();
  },

  updateUserProfileUI: function () {
    if (!this.currentUser) return;
    document.getElementById('profile-name').textContent = this.currentUser.name;
    document.getElementById('profile-role').textContent = this.currentUser.role === 'superadmin' ? 'Superadmin' : 'Admin';
    document.getElementById('avatar-letters').textContent = this.currentUser.name.split(' ').map(n => n[0]).join('').substr(0, 2).toUpperCase();
  },

  bindEvents: function () {
    const self = this;

    // Login Form Submission
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;
        const res = DB.login(email, pass);
        if (res.success) {
          self.currentUser = res.user;
          self.updateUserProfileUI();
          self.switchView(res.user.role === 'superadmin' ? 'superadmin' : 'dashboard');
        } else {
          alert(res.message || 'Login failed.');
        }
      });
    }

    // Logout click
    const logoutBtn = document.getElementById('btn-logout-sidebar');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        DB.logout();
        self.currentUser = null;
        self.switchView('login');
      });
    }

    // Theme toggle click
    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const isLight = document.body.classList.toggle('theme-light');
        localStorage.setItem('theme_preference', isLight ? 'light' : 'dark');

        if (isLight) {
          themeBtn.innerHTML = `<i data-lucide="moon"></i> <span>Dark Mode</span>`;
        } else {
          themeBtn.innerHTML = `<i data-lucide="sun"></i> <span>Light Mode</span>`;
        }

        self.initLucide();

        // Redraw charts if on dashboard view
        if (self.currentView === 'dashboard') {
          self.renderCharts();
        }
      });
    }

    // Sidebar menu navigation routing
    document.querySelectorAll('.menu-item a').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const view = link.parentElement.dataset.view;
        if (view) self.switchView(view);
      });
    });

    // --- Search & Filters on Dashboard ---
    const searchControl = document.getElementById('search-employee');
    if (searchControl) {
      searchControl.addEventListener('input', () => {
        self.currentPage = 1;
        self.filterAndRenderTable();
      });
    }

    const filterStatus = document.getElementById('filter-status');
    if (filterStatus) {
      filterStatus.addEventListener('change', () => {
        self.currentPage = 1;
        self.filterAndRenderTable();
      });
    }

    // --- Employee Add / Edit Modal Events ---
    const btnAddEmployee = document.getElementById('btn-add-employee');
    if (btnAddEmployee) {
      btnAddEmployee.addEventListener('click', () => {
        self.openEmployeeModal();
      });
    }

    const employeeForm = document.getElementById('employee-form');
    if (employeeForm) {
      employeeForm.addEventListener('submit', (e) => {
        e.preventDefault();
        self.saveEmployeeForm();
      });
    }

    // Close Modals
    document.querySelectorAll('.btn-close-modal, .btn-cancel-modal').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
      });
    });

    // --- Excel Importer Drag & Drop ---
    const fileInput = document.getElementById('excel-file-input');
    const dropzone = document.getElementById('excel-dropzone');

    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());

      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });

      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
      });

      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
          self.handleExcelUpload(e.dataTransfer.files[0]);
        }
      });

      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
          self.handleExcelUpload(e.target.files[0]);
        }
      });
    }

    const btnTemplate = document.getElementById('btn-download-template');
    if (btnTemplate) {
      btnTemplate.addEventListener('click', () => {
        ExcelHandler.downloadTemplate();
      });
    }

    // Committing bulk import
    const btnCommitImport = document.getElementById('btn-commit-import');
    if (btnCommitImport) {
      btnCommitImport.addEventListener('click', () => {
        self.commitBulkImport();
      });
    }

    // --- Superadmin Settings Forms ---
    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
      settingsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        self.saveSettingsForm();
      });
    }

    // Admin account management actions
    const btnAddAdmin = document.getElementById('btn-add-admin');
    if (btnAddAdmin) {
      btnAddAdmin.addEventListener('click', () => {
        self.openAdminModal();
      });
    }

    const adminForm = document.getElementById('admin-form');
    if (adminForm) {
      adminForm.addEventListener('submit', (e) => {
        e.preventDefault();
        self.saveAdminForm();
        self.loadSuperadminData();
        alert('Account saved successfully!');
      });
    }

    // Outbox Search filter
    const searchOutbox = document.getElementById('search-outbox');
    if (searchOutbox) {
      searchOutbox.addEventListener('input', () => {
        self.renderOutboxList();
      });
    }

    // Database Backup Export/Import
    const btnExportBackup = document.getElementById('btn-export-backup');
    if (btnExportBackup) {
      btnExportBackup.addEventListener('click', () => {
        DB.exportBackup();
      });
    }

    const btnImportBackup = document.getElementById('btn-import-backup');
    const backupFileInput = document.getElementById('backup-file-input');
    if (btnImportBackup && backupFileInput) {
      btnImportBackup.addEventListener('click', () => backupFileInput.click());
      backupFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = async (evt) => {
            const res = await DB.importBackup(evt.target.result);
            if (res.success) {
              alert('System Backup Restored Successfully!');
              window.location.reload();
            } else {
              alert(res.message || 'Backup restore failed.');
            }
          };
          reader.readAsText(file);
        }
      });
    }
  },

  // --- Dashboard Logic ---
  loadDashboardData: function () {
    this.employees = DB.getEmployees();
    this.filterAndRenderTable();
    this.renderCharts();
  },

  filterAndRenderTable: function () {
    const searchVal = document.getElementById('search-employee').value.toLowerCase().trim();
    const statusVal = document.getElementById('filter-status').value;
    const settings = DB.getSettings();

    this.filteredEmployees = this.employees.filter(emp => {
      // Name or Passport search
      const matchesSearch = emp.name.toLowerCase().includes(searchVal) ||
        emp.passportNo.toLowerCase().includes(searchVal) ||
        (emp.ql && emp.ql.toLowerCase().includes(searchVal));

      if (!matchesSearch) return false;

      // Status filter
      if (statusVal === 'all') return true;

      const evalData = Notifications.evaluateEmployee(emp, settings.warningDays);
      return evalData.status === statusVal;
    });

    this.renderEmployeeTable();
  },

  renderEmployeeTable: function () {
    const tbody = document.getElementById('employee-tbody');
    tbody.innerHTML = '';

    const settings = DB.getSettings();
    const startIdx = (this.currentPage - 1) * this.rowsPerPage;
    const endIdx = startIdx + this.rowsPerPage;
    const pageData = this.filteredEmployees.slice(startIdx, endIdx);

    if (pageData.length === 0) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--text-muted); padding: 32px;">No matching records found.</td></tr>`;
      this.updatePaginationUI();
      return;
    }

    pageData.forEach(emp => {
      const evalData = Notifications.evaluateEmployee(emp, settings.warningDays);
      const tr = document.createElement('tr');

      // Helper to generate badge HTML for document date
      const getBadgeHTML = (dateVal, evalResult) => {
        if (evalResult.status === Notifications.STATUS_EMPTY) {
          return `<span class="badge badge-empty">N/A</span>`;
        }

        let badgeClass = 'badge-healthy';
        let desc = `${evalResult.daysRemaining} days left`;

        if (evalResult.status === Notifications.STATUS_DANGER) {
          badgeClass = 'badge-danger';
          desc = `EXPIRED (${Math.abs(evalResult.daysRemaining)}d ago)`;
        } else if (evalResult.status === Notifications.STATUS_WARNING) {
          badgeClass = 'badge-warning';
        }

        return `
          <span class="badge ${badgeClass}">
            ${dateVal}
            <span class="badge-date">${desc}</span>
          </span>
        `;
      };

      tr.innerHTML = `
        <td>${getBadgeHTML(emp.ql, evalData.documents.ql)}</td>
        <td><strong>${emp.name}</strong></td>
        <td><code>${emp.passportNo}</code></td>
        <td>${getBadgeHTML(emp.passportExpiry, evalData.documents.passportExpiry)}</td>
        <td>${getBadgeHTML(emp.medicalExpiry, evalData.documents.medicalExpiry)}</td>
        <td>${getBadgeHTML(emp.insuranceExpiry, evalData.documents.insuranceExpiry)}</td>
        <td>${getBadgeHTML(emp.employmentPassExpiry, evalData.documents.employmentPassExpiry)}</td>
        <td>${getBadgeHTML(emp.employer, evalData.documents.employer)}</td>
        <td>${getBadgeHTML(emp.employerContact, evalData.documents.employerContact)}</td>
        <td>${getBadgeHTML(emp.tanaExpiry, evalData.documents.tanaExpiry)}</td>
        <td>${getBadgeHTML(emp.greenIcExpiry, evalData.documents.greenIcExpiry)}</td>
        <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${emp.remarks || ''}">${emp.remarks || '-'}</td>
        <td>
          <div class="actions-cell">
            <button class="btn-icon btn-edit" title="Edit Employee"><i data-lucide="edit-3"></i></button>
            <button class="btn-icon btn-notify text-warning" title="Send Notifications"><i data-lucide="bell"></i></button>
            <button class="btn-icon btn-delete text-danger" title="Delete Employee"><i data-lucide="trash-2"></i></button>
          </div>
        </td>
      `;

      // Attach row event listeners
      tr.querySelector('.btn-edit').addEventListener('click', () => this.openEmployeeModal(emp.id));
      tr.querySelector('.btn-notify').addEventListener('click', () => this.openNotificationTriggerModal(emp.id));
      tr.querySelector('.btn-delete').addEventListener('click', () => {
        if (confirm(`Are you sure you want to delete ${emp.name}?`)) {
          DB.deleteEmployee(emp.id);
          this.loadDashboardData();
        }
      });

      tbody.appendChild(tr);
    });

    this.updatePaginationUI();
    this.initLucide();
  },

  updatePaginationUI: function () {
    const totalCount = this.filteredEmployees.length;
    const totalPages = Math.ceil(totalCount / this.rowsPerPage) || 1;

    document.getElementById('pagination-info-text').textContent =
      `Showing ${totalCount > 0 ? (this.currentPage - 1) * this.rowsPerPage + 1 : 0} to ${Math.min(this.currentPage * this.rowsPerPage, totalCount)} of ${totalCount} records`;

    const btnPrev = document.getElementById('btn-prev-page');
    const btnNext = document.getElementById('btn-next-page');

    btnPrev.disabled = this.currentPage === 1;
    btnNext.disabled = this.currentPage === totalPages;

    // Remove existing event listeners by replacing nodes, then re-bind
    const newBtnPrev = btnPrev.cloneNode(true);
    const newBtnNext = btnNext.cloneNode(true);
    btnPrev.replaceWith(newBtnPrev);
    btnNext.replaceWith(newBtnNext);

    newBtnPrev.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.renderEmployeeTable();
      }
    });

    newBtnNext.addEventListener('click', () => {
      if (this.currentPage < totalPages) {
        this.currentPage++;
        this.renderEmployeeTable();
      }
    });
  },

  // --- Charts Dashboard ---
  renderCharts: function () {
    const settings = DB.getSettings();
    const isLight = document.body.classList.contains('theme-light');
    const textColor = isLight ? '#475569' : '#94a3b8';
    const gridColor = isLight ? 'rgba(15, 23, 42, 0.06)' : 'rgba(255, 255, 255, 0.05)';
    const chartBgColor = isLight ? '#ffffff' : '#0a0c10';

    // Calculate status aggregates (Healthy, Warning, Danger)
    let healthyCount = 0;
    let warningCount = 0;
    let dangerCount = 0;

    // Calculate document-wise alert aggregates
    const docAlerts = {
      ql: 0,
      passportExpiry: 0,
      medicalExpiry: 0,
      insuranceExpiry: 0,
      employmentPassExpiry: 0,
      tanaExpiry: 0,
      greenIcExpiry: 0
    };

    this.employees.forEach(emp => {
      const evalData = Notifications.evaluateEmployee(emp, settings.warningDays);
      if (evalData.status === Notifications.STATUS_HEALTHY) healthyCount++;
      else if (evalData.status === Notifications.STATUS_WARNING) warningCount++;
      else if (evalData.status === Notifications.STATUS_DANGER) dangerCount++;

      // Sum sub-document warnings/expired
      for (const [key, evalResult] of Object.entries(evalData.documents)) {
        if (evalResult.status === Notifications.STATUS_DANGER || evalResult.status === Notifications.STATUS_WARNING) {
          docAlerts[key]++;
        }
      }
    });

    // Update Dashboard metric summaries in the top row
    document.getElementById('total-employees-count').textContent = this.employees.length;
    document.getElementById('expired-count-metric').textContent = dangerCount;
    document.getElementById('expiring-count-metric').textContent = warningCount;
    document.getElementById('active-healthy-metric').textContent = healthyCount;

    // Initialize Chart 1: Donut Status
    if (this.statusChart) this.statusChart.destroy();
    const ctxStatus = document.getElementById('statusChart').getContext('2d');
    this.statusChart = new Chart(ctxStatus, {
      type: 'doughnut',
      data: {
        labels: ['Healthy', 'Expiring Soon', 'Expired'],
        datasets: [{
          data: [healthyCount, warningCount, dangerCount],
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
          borderColor: chartBgColor,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: textColor, font: { family: 'Inter' } }
          }
        }
      }
    });

    // Initialize Chart 2: Expirations By Document Type Bar Chart
    if (this.typeChart) this.typeChart.destroy();
    const ctxType = document.getElementById('typeChart').getContext('2d');
    this.typeChart = new Chart(ctxType, {
      type: 'bar',
      data: {
        labels: ['QL', 'Passport', 'Medical', 'Insurance', 'EP', 'TANA', 'Green IC'],
        datasets: [{
          label: 'Alerts (Expired / Warning)',
          data: [
            docAlerts.ql,
            docAlerts.passportExpiry,
            docAlerts.medicalExpiry,
            docAlerts.insuranceExpiry,
            docAlerts.employmentPassExpiry,
            docAlerts.tanaExpiry,
            docAlerts.greenIcExpiry
          ],
          backgroundColor: 'rgba(37, 99, 235, 0.75)',
          borderColor: '#2563eb',
          borderWidth: 1,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { color: textColor, stepSize: 1 },
            grid: { color: gridColor }
          },
          x: {
            ticks: { color: textColor },
            grid: { display: false }
          }
        }
      }
    });
  },

  // --- Employee Modals & Actions ---
  openEmployeeModal: function (employeeId = null) {
    const modal = document.getElementById('modal-employee');
    const title = document.getElementById('employee-modal-title');
    const form = document.getElementById('employee-form');

    form.reset();
    this.selectedEmployeeId = employeeId;

    if (employeeId) {
      title.textContent = 'Edit Employee Record';
      const emp = DB.getEmployeeById(employeeId);
      if (emp) {
        document.getElementById('emp-ql').value = emp.ql || '';
        document.getElementById('emp-name').value = emp.name || '';
        document.getElementById('emp-passport-no').value = emp.passportNo || '';
        document.getElementById('emp-passport-expiry').value = emp.passportExpiry || '';
        document.getElementById('emp-medical-expiry').value = emp.medicalExpiry || '';
        document.getElementById('emp-insurance-expiry').value = emp.insuranceExpiry || '';
        document.getElementById('emp-ep-expiry').value = emp.employmentPassExpiry || '';
        document.getElementById('emp-tana-expiry').value = emp.tanaExpiry || '';
        document.getElementById('emp-greenic-expiry').value = emp.greenIcExpiry || '';
        document.getElementById('emp-remarks').value = emp.remarks || '';

        // Contacts
        document.getElementById('emp-emails').value = emp.contacts?.emails ? emp.contacts.emails.join(', ') : '';
        document.getElementById('emp-whatsapp').value = emp.contacts?.whatsappNumbers ? emp.contacts.whatsappNumbers.join(', ') : '';
      }
    } else {
      title.textContent = 'Add New Employee';
    }

    modal.classList.add('active');
  },

  saveEmployeeForm: function () {
    const empData = {
      id: this.selectedEmployeeId,
      ql: document.getElementById('emp-ql').value.trim(),
      name: document.getElementById('emp-name').value.trim(),
      passportNo: document.getElementById('emp-passport-no').value.trim(),
      passportExpiry: document.getElementById('emp-passport-expiry').value,
      medicalExpiry: document.getElementById('emp-medical-expiry').value,
      insuranceExpiry: document.getElementById('emp-insurance-expiry').value,
      employmentPassExpiry: document.getElementById('emp-ep-expiry').value,
      employer: document.getElementById('emp-employer').value.trim(),
      employerContact: document.getElementById('emp-employer-contact').value.trim(),
      tanaExpiry: document.getElementById('emp-tana-expiry').value,
      greenIcExpiry: document.getElementById('emp-greenic-expiry').value,
      remarks: document.getElementById('emp-remarks').value.trim(),
      contacts: {
        emails: document.getElementById('emp-emails').value.split(',').map(e => e.trim()).filter(Boolean),
        whatsappNumbers: document.getElementById('emp-whatsapp').value.split(',').map(w => w.trim()).filter(Boolean)
      }
    };

    const res = DB.saveEmployee(empData);
    if (res.success) {
      document.getElementById('modal-employee').classList.remove('active');
      this.loadDashboardData();
    } else {
      alert(res.message);
    }
  },

  // --- Notification Overrides Trigger Modal ---
  openNotificationTriggerModal: function (employeeId) {
    const emp = DB.getEmployeeById(employeeId);
    if (!emp) return;

    this.selectedEmployeeId = employeeId;
    const settings = DB.getSettings();
    const evalData = Notifications.evaluateEmployee(emp, settings.warningDays);

    document.getElementById('notify-target-name').textContent = emp.name;
    document.getElementById('notify-target-passport').textContent = emp.passportNo;

    // Load available contacts for buttons
    const emails = Notifications.getEmailsForEmployee(emp, settings);
    const whatsappNumbers = Notifications.getWhatsappForEmployee(emp, settings);

    // Render Contact lists
    const emailListDiv = document.getElementById('notify-email-recipients');
    emailListDiv.innerHTML = '';
    if (emails.length === 0) {
      emailListDiv.innerHTML = `<span style="color: var(--text-muted);">No email addresses configured.</span>`;
    } else {
      emails.forEach(email => {
        emailListDiv.innerHTML += `<div style="display:flex; align-items:center; gap:8px; margin-bottom: 6px;"><i data-lucide="mail" style="width:14px; color: var(--primary);"></i> <span>${email}</span></div>`;
      });
    }

    const waListDiv = document.getElementById('notify-wa-recipients');
    waListDiv.innerHTML = '';
    if (whatsappNumbers.length === 0) {
      waListDiv.innerHTML = `<span style="color: var(--text-muted);">No WhatsApp numbers configured.</span>`;
    } else {
      whatsappNumbers.forEach(num => {
        waListDiv.innerHTML += `<div style="display:flex; align-items:center; gap:8px; margin-bottom: 6px;"><i data-lucide="phone" style="width:14px; color: var(--status-healthy);"></i> <span>${num}</span></div>`;
      });
    }

    // Render preview message content
    const msgText = Notifications.generateMessageText(emp, evalData);
    const textPreview = document.getElementById('notify-msg-preview');
    textPreview.textContent = msgText;

    // Bind WhatsApp Trigger Buttons
    const waActionsDiv = document.getElementById('notify-wa-actions-wrapper');
    waActionsDiv.innerHTML = '';
    if (whatsappNumbers.length > 0) {
      whatsappNumbers.forEach(num => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary w-full';
        btn.style.marginBottom = '8px';
        btn.innerHTML = `<i data-lucide="phone"></i> Launch WhatsApp Web (${num})`;
        btn.addEventListener('click', () => {
          const url = Notifications.generateWhatsappUrl(num, msgText);
          Notifications.logWhatsappSimulated(emp, evalData, num, msgText, this.currentUser.name);
          window.open(url, '_blank');
        });
        waActionsDiv.appendChild(btn);
      });
    } else {
      waActionsDiv.innerHTML = `<button class="btn btn-secondary w-full" disabled>WhatsApp Contact Missing</button>`;
    }

    // Bind Email Trigger Button
    const btnSendEmail = document.getElementById('btn-trigger-email');
    const newBtnEmail = btnSendEmail.cloneNode(true);
    btnSendEmail.replaceWith(newBtnEmail);

    if (emails.length > 0) {
      newBtnEmail.disabled = false;
      newBtnEmail.addEventListener('click', () => {
        const res = Notifications.sendEmailSimulated(emp, evalData, emails, this.currentUser.name);
        alert(`Email notification generated for ${res.count} addresses. View details in the System Outbox.`);
        document.getElementById('modal-notify-trigger').classList.remove('active');
      });
    } else {
      newBtnEmail.disabled = true;
    }

    document.getElementById('modal-notify-trigger').classList.add('active');
    this.initLucide();
  },

  // --- Excel Bulk Importer ---
  handleExcelUpload: function (file) {
    const self = this;
    const previewContainer = document.getElementById('excel-preview-container');
    const dropzone = document.getElementById('excel-dropzone');
    const btnCommit = document.getElementById('btn-commit-import');

    // Show spinner/parsing state
    dropzone.innerHTML = `<i data-lucide="loader" class="animate-spin" style="color: var(--primary);"></i><div class="dropzone-title">Parsing sheet...</div>`;
    this.initLucide();

    ExcelHandler.parseFile(file, (res) => {
      // Restore dropzone state
      dropzone.innerHTML = `
        <i data-lucide="upload-cloud"></i>
        <div class="dropzone-title">Click to upload or drag & drop</div>
        <div class="dropzone-desc">XLSX, XLS files matching template columns</div>
      `;
      self.initLucide();

      if (!res.success) {
        alert(res.message);
        previewContainer.classList.add('d-none');
        btnCommit.classList.add('d-none');
        return;
      }

      // Display Preview table
      previewContainer.classList.remove('d-none');
      btnCommit.classList.remove('d-none');

      // Store parsed data globally temporarily to commit later
      self.tempImportData = res.data;

      // Populate preview list UI
      const countEl = document.getElementById('excel-import-count');
      countEl.textContent = `Identified ${res.data.length} employees to import.`;

      const tbody = document.getElementById('excel-preview-tbody');
      tbody.innerHTML = '';

      res.data.slice(0, 10).forEach(emp => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${emp.ql || '-'}</td>
          <td><strong>${emp.name}</strong></td>
          <td><code>${emp.passportNo}</code></td>
          <td>${emp.passportExpiry || '-'}</td>
          <td>${emp.medicalExpiry || '-'}</td>
          <td>${emp.insuranceExpiry || '-'}</td>
          <td>${emp.employmentPassExpiry || '-'}</td>
          <td>${emp.employer || '-'}</td>
          <td>${emp.employerContact || '-'}</td>
          <td>${emp.tanaExpiry || '-'}</td>
          <td>${emp.greenIcExpiry || '-'}</td>
        `;
        tbody.appendChild(tr);
      });

      if (res.data.length > 10) {
        tbody.innerHTML += `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 8px;">... and ${res.data.length - 10} more rows</td></tr>`;
      }

      // Render validation errors if any
      const errorDiv = document.getElementById('excel-validation-errors');
      errorDiv.innerHTML = '';
      if (res.errors && res.errors.length > 0) {
        errorDiv.classList.remove('d-none');
        res.errors.forEach(err => {
          errorDiv.innerHTML += `<div class="text-danger" style="margin-bottom: 4px; font-size:12px;">⚠️ ${err}</div>`;
        });
      } else {
        errorDiv.classList.add('d-none');
      }
    });
  },

  commitBulkImport: function () {
    if (!this.tempImportData || this.tempImportData.length === 0) return;

    // Ensure bulk import returns a valid response object
    const res = DB.bulkImportEmployees(this.tempImportData) || {};
    if (res && res.success) {
      alert(`Import complete! Added ${res.added} new records and updated ${res.updated} existing records.`);

      // Reset variables and view
      this.tempImportData = null;
      document.getElementById('excel-preview-container').classList.add('d-none');
      document.getElementById('btn-commit-import').classList.add('d-none');
      document.getElementById('modal-excel-import').classList.remove('active');

      this.loadDashboardData();
    } else {
      const msg = res && res.message ? res.message : 'Import failed due to unknown error.';
      alert(`Import failed: ${msg}`);
    }
  },

  // --- Outbox View (Notifications Sandbox) ---
  loadOutboxData: function () {
    this.selectedLogId = null;
    this.renderOutboxList();
  },

  renderOutboxList: function () {
    const logs = DB.getNotificationsLog();
    const searchVal = document.getElementById('search-outbox').value.toLowerCase().trim();
    const listContainer = document.getElementById('outbox-list-container');

    listContainer.innerHTML = '';

    const filteredLogs = logs.filter(log => {
      return log.employeeName.toLowerCase().includes(searchVal) ||
        log.recipient.toLowerCase().includes(searchVal) ||
        log.subject.toLowerCase().includes(searchVal);
    });

    if (filteredLogs.length === 0) {
      listContainer.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-muted);">Outbox is empty.</div>`;
      document.getElementById('outbox-envelope-panel').classList.add('d-none');
      return;
    }

    filteredLogs.forEach(log => {
      const isSelected = this.selectedLogId === log.id;
      const item = document.createElement('div');
      item.className = `glass-panel log-item ${isSelected ? 'active' : ''}`;

      const badgeClass = log.type === 'Email' ? 'email' : 'whatsapp';
      const formattedDate = new Date(log.sentAt).toLocaleString();

      item.innerHTML = `
        <div class="log-header">
          <span class="log-recipient">${log.recipient}</span>
          <span class="log-time">${formattedDate}</span>
        </div>
        <div class="log-meta">
          <span class="badge-channel ${badgeClass}">${log.type}</span>
          <span style="color: var(--text-secondary);">Emp: <strong>${log.employeeName}</strong></span>
        </div>
        <div style="font-size:12px; color: var(--text-muted); margin-top: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${log.subject}
        </div>
      `;

      item.addEventListener('click', () => {
        this.selectedLogId = log.id;
        this.renderOutboxList(); // update active state highlights
        this.renderEnvelopeView(log);
      });

      listContainer.appendChild(item);
    });

    // Auto-select first log if none is selected
    if (!this.selectedLogId && filteredLogs.length > 0) {
      this.selectedLogId = filteredLogs[0].id;
      this.renderEnvelopeView(filteredLogs[0]);
    }
  },

  renderEnvelopeView: function (log) {
    const envelope = document.getElementById('outbox-envelope-panel');
    envelope.classList.remove('d-none');

    document.getElementById('env-recipient-label').textContent = log.type === 'Email' ? 'To (Email):' : 'To (WhatsApp):';
    document.getElementById('env-recipient').textContent = log.recipient;
    document.getElementById('env-subject').textContent = log.subject;
    document.getElementById('env-date').textContent = new Date(log.sentAt).toLocaleString();
    document.getElementById('env-sender').textContent = log.sentBy || 'System';

    const bodyDiv = document.getElementById('env-body');
    if (log.type === 'Email') {
      bodyDiv.innerHTML = log.body; // Render beautiful HTML format inside iframe or div securely
    } else {
      // WhatsApp message plain text
      bodyDiv.innerHTML = `<pre style="font-family: inherit; font-size: 13px; white-space: pre-wrap; color:#34d399;">${log.body}</pre>`;
    }
  },

  // --- Alerts list page (Aggregated alerts view) ---
  loadAlertsData: function () {
    const employees = DB.getEmployees();
    const settings = DB.getSettings();
    const container = document.getElementById('alerts-list-container');

    container.innerHTML = '';

    let dangerAlerts = [];
    let warningAlerts = [];

    const docLabels = {
      ql: 'QL',
      passportExpiry: 'Passport',
      medicalExpiry: 'Medical Check',
      insuranceExpiry: 'Insurance',
      employmentPassExpiry: 'Employment Pass',
      employer: 'Employer',
      employerContact: 'Employer Contact',
      tanaExpiry: 'TANA Pass',
      greenIcExpiry: 'Green IC'
    };

    employees.forEach(emp => {
      const evalData = Notifications.evaluateEmployee(emp, settings.warningDays);
      for (const [key, evalResult] of Object.entries(evalData.documents)) {
        if (evalResult.status === Notifications.STATUS_DANGER) {
          dangerAlerts.push({ emp, docKey: key, evalResult });
        } else if (evalResult.status === Notifications.STATUS_WARNING) {
          warningAlerts.push({ emp, docKey: key, evalResult });
        }
      }
    });

    const allAlerts = [...dangerAlerts, ...warningAlerts];

    if (allAlerts.length === 0) {
      container.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--text-healthy);">
          <i data-lucide="check-circle" style="width:48px; height:48px; margin-bottom: 12px;"></i>
          <h3>No Active Alerts</h3>
          <p style="color: var(--text-secondary); margin-top: 4px;">All document expiration dates are healthy and up to date.</p>
        </div>
      `;
      this.initLucide();
      return;
    }

    allAlerts.forEach(alertItem => {
      const isDanger = alertItem.evalResult.status === Notifications.STATUS_DANGER;
      const card = document.createElement('div');
      card.className = `alert-strip ${isDanger ? 'danger' : 'warning'}`;

      const desc = isDanger
        ? `Expired on ${alertItem.emp[alertItem.docKey]} (${Math.abs(alertItem.evalResult.daysRemaining)} days ago)`
        : `Expiring on ${alertItem.emp[alertItem.docKey]} (${alertItem.evalResult.daysRemaining} days remaining)`;

      card.innerHTML = `
        <div class="alert-strip-details">
          <span class="alert-strip-title">${alertItem.emp.name} — ${docLabels[alertItem.docKey]}</span>
          <span class="alert-strip-subtitle">Passport No: <strong>${alertItem.emp.passportNo}</strong> | ${desc}</span>
        </div>
        <button class="btn btn-secondary btn-sm" style="padding:6px 12px; font-size:12px;">
          <i data-lucide="bell" style="width:12px;"></i> Notify
        </button>
      `;

      card.querySelector('button').addEventListener('click', () => {
        this.openNotificationTriggerModal(alertItem.emp.id);
      });

      container.appendChild(card);
    });

    this.initLucide();
  },

  // --- Superadmin Settings & Accounts Management ---
  loadSuperadminData: function () {
    this.renderAdminListTable();

    // Load current system settings to form inputs
    const settings = DB.getSettings();
    document.getElementById('set-warning-days').value = settings.warningDays || 30;
    document.getElementById('set-emails').value = settings.defaultEmails || '';
    document.getElementById('set-whatsapp').value = settings.defaultWhatsapp || '';
  },

  renderAdminListTable: function () {
    const tbody = document.getElementById('admin-tbody');
    tbody.innerHTML = '';

    const admins = DB.getAdmins();

    if (admins.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 16px;">No admin accounts created.</td></tr>`;
      return;
    }

    admins.forEach(admin => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${admin.name}</strong></td>
        <td><code>${admin.email}</code></td>
        <td><code>${admin.password}</code></td>
        <td>
          <div class="actions-cell">
            <button class="btn-icon btn-edit-admin"><i data-lucide="edit-3"></i></button>
            <button class="btn-icon btn-delete-admin text-danger"><i data-lucide="trash-2"></i></button>
          </div>
        </td>
      `;

      tr.querySelector('.btn-edit-admin').addEventListener('click', () => this.openAdminModal(admin.id));
      tr.querySelector('.btn-delete-admin').addEventListener('click', () => {
        if (confirm(`Are you sure you want to delete admin account ${admin.name}?`)) {
          DB.deleteAdmin(admin.id);
          this.loadSuperadminData();
        }
      });

      tbody.appendChild(tr);
    });

    this.initLucide();
  },

  openAdminModal: function (adminId = null) {
    const modal = document.getElementById('modal-admin');
    const title = document.getElementById('admin-modal-title');
    const form = document.getElementById('admin-form');

    form.reset();
    this.selectedAdminId = adminId;

    if (adminId) {
      title.textContent = 'Edit Admin Account';
      const admin = (DB._get('db_users') || []).find(u => u.id === adminId);
      if (admin) {
        document.getElementById('admin-name').value = admin.name || '';
        document.getElementById('admin-email').value = admin.email || '';
        document.getElementById('admin-password').value = admin.password || '';
      }
    } else {
      title.textContent = 'Add New Admin Account';
    }

    modal.classList.add('active');
  },

  saveAdminForm: function () {
    const adminData = {
      id: this.selectedAdminId,
      name: document.getElementById('admin-name').value.trim(),
      email: document.getElementById('admin-email').value.trim(),
      password: document.getElementById('admin-password').value.trim()
    };

    const res = DB.saveAdmin(adminData);
    if (res.success) {
      document.getElementById('modal-admin').classList.remove('active');
      this.loadSuperadminData();
    } else {
      alert(res.message);
    }
  },

  saveSettingsForm: function () {
    const settingsData = {
      warningDays: parseInt(document.getElementById('set-warning-days').value, 10) || 30,
      defaultEmails: document.getElementById('set-emails').value.trim(),
      defaultWhatsapp: document.getElementById('set-whatsapp').value.trim()
    };

    const res = DB.saveSettings(settingsData);
    if (res.success) {
      alert('System settings updated successfully!');
      this.loadSuperadminData();
    }
  }
};

// Initialize application on page load
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

// Expose elements to window object for trigger links
window.App = App;
window.switchView = (v) => App.switchView(v);
window.openModal = (modalId) => document.getElementById(modalId).classList.add('active');

// When database.json loads from server, refresh the active view
window.addEventListener('db-synced', () => {
  console.log('[App] Server DB synced — refreshing UI');
  App.checkSession();
});

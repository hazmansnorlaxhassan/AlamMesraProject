/**
 * Excel Handler Module - Parses and Generates Excel sheets via SheetJS (XLSX)
 */
const ExcelHandler = {
  // Expected headers in the Excel file
  schema: [
    'QL',
    'Name',
    'Passport No',
    'Passport',
    'Medical',
    'Insurance',
    'Employment Pass',
    'Employer',
    'Employer Contact',
    'TANA',
    'Green IC',
    'Remarks'
  ],

  // Download a pre-formatted template with mock records
  downloadTemplate: function () {
    if (typeof XLSX === 'undefined') {
      alert('Excel library (SheetJS) is loading. Please try again in a moment.');
      return;
    }

    const headers = this.schema;

    // Add some sample data rows to guide the user
    const sampleRows = [
      headers,
      [
        '15/09/2026', // QL Expiry
        'John Smith',
        'A88776655',
        '25/12/2026', // Passport Expiry
        '10/08/2026', // Medical Expiry
        '01/11/2027', // Insurance Expiry
        '15/07/2026', // Employment Pass Expiry
        '', //Employer
        '', //Employer Contact
        '30/09/2026', // TANA Expiry
        '',           // Green IC Expiry (Leave empty for N/A)
        'Sample Row: Fill dates as DD/MM/YYYY or YYYY-MM-DD'
      ],
      [
        '20/03/2027', // QL Expiry
        'Jane Doe',
        'B11223344',
        '15/05/2027',
        '', // Medical Expiry (empty)
        '20/12/2026',
        'Company B', //Employer
        '0123456789', //Employer Contact
        '05/06/2028',
        'Green IC is applicable for permanent residents.'
      ]
    ];

    // Create SheetJS workbook and worksheet
    const ws = XLSX.utils.aoa_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expirations Template');

    // Trigger download
    XLSX.writeFile(wb, 'expiration_data_template.xlsx');
  },

  // Parse Excel file from an HTML Input or Drag & Drop event
  parseFile: function (file, callback) {
    if (typeof XLSX === 'undefined') {
      callback({ success: false, message: 'Excel library is not loaded. Check internet connection.' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target.result;
        const workbook = XLSX.read(data, {
          type: 'binary',
          cellDates: true,
          dateNF: 'yyyy-mm-dd'
        });

        // Read first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert sheet to 2D Array of raw values to inspect headers
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (rows.length === 0) {
          callback({ success: false, message: 'The uploaded file is empty.' });
          return;
        }

        const headers = rows[0].map(h => String(h).trim());
        const dataRows = rows.slice(1);

        // Map column indices based on matches with our schema
        const mapping = this.detectMapping(headers);

        // If Name and Passport No are missing, import will fail
        if (mapping.nameIdx === -1 || mapping.passportNoIdx === -1) {
          callback({
            success: false,
            message: 'Unable to identify "Name" and "Passport No" headers. Please check the Excel template.',
            headers: headers
          });
          return;
        }

        const parsedEmployees = [];
        const validationErrors = [];

        dataRows.forEach((row, index) => {
          // Skip completely empty rows
          if (row.filter(cell => cell !== '').length === 0) return;

          const rowNum = index + 2; // Excel row numbering (1-indexed + header offset)
          const name = this.getVal(row, mapping.nameIdx);
          const passportNo = this.getVal(row, mapping.passportNoIdx);

          if (!name) {
            validationErrors.push(`Row ${rowNum}: Name is missing.`);
            return;
          }
          if (!passportNo) {
            validationErrors.push(`Row ${rowNum}: Passport No is missing.`);
            return;
          }

          // Format dates robustly
          const record = {
            ql: this.cleanDate(this.getVal(row, mapping.qlIdx)),
            name: name,
            passportNo: passportNo,
            passportExpiry: this.cleanDate(this.getVal(row, mapping.passportExpiryIdx)),
            medicalExpiry: this.cleanDate(this.getVal(row, mapping.medicalExpiryIdx)),
            insuranceExpiry: this.cleanDate(this.getVal(row, mapping.insuranceExpiryIdx)),
            employmentPassExpiry: this.cleanDate(this.getVal(row, mapping.employmentPassExpiryIdx)),
            employer: this.getVal(row, mapping.employerIdx),
            employerContact: this.getVal(row, mapping.employerContactIdx),
            tanaExpiry: this.cleanDate(this.getVal(row, mapping.tanaExpiryIdx)),
            greenIcExpiry: this.cleanDate(this.getVal(row, mapping.greenIcExpiryIdx)),
            remarks: this.getVal(row, mapping.remarksIdx),
            // Initialize with default empty overrides (defaults to global settings)
            contacts: {
              emails: [],
              whatsappNumbers: []
            }
          };

          parsedEmployees.push(record);
        });

        callback({
          success: true,
          data: parsedEmployees,
          errors: validationErrors,
          totalRowsChecked: dataRows.length
        });

      } catch (err) {
        console.error(err);
        callback({ success: false, message: 'Failed to read file: ' + err.message });
      }
    };

    reader.onerror = () => {
      callback({ success: false, message: 'File reading error.' });
    };

    reader.readAsBinaryString(file);
  },

  // Helper to extract cell value safely
  getVal: function (row, idx) {
    if (idx === -1 || idx >= row.length) return '';
    return row[idx] !== undefined && row[idx] !== null ? String(row[idx]).trim() : '';
  },

  // Find index of headers dynamically
  detectMapping: function (headers) {
    const lowerHeaders = headers.map(h => h.toLowerCase().trim());

    // Helper: find the first header index matching any of the given aliases
    function findIdx(aliases) {
      for (let i = 0; i < lowerHeaders.length; i++) {
        for (const alias of aliases) {
          if (lowerHeaders[i] === alias.toLowerCase()) {
            return i;
          }
        }
      }
      return -1;
    }

    return {
      qlIdx: findIdx(['ql', 'ql expiry', 'ql exp']),
      nameIdx: findIdx(['name', 'employee name', 'full name']),
      passportNoIdx: findIdx(['passport no', 'passport number', 'passportno', 'pp no']),
      passportExpiryIdx: findIdx(['passport', 'passport expiry', 'passport expiry date', 'passport exp', 'passport exp date']),
      medicalExpiryIdx: findIdx(['medical', 'medical expiry', 'medical expiry date', 'medical exp']),
      insuranceExpiryIdx: findIdx(['insurance', 'insurance expiry', 'insurance expiry date', 'insurance exp']),
      employmentPassExpiryIdx: findIdx(['employment pass', 'ep', 'employment pass expiry', 'ep expiry']),
      employerIdx: findIdx(['employer', 'company', 'employer name', 'company name']),
      employerContactIdx: findIdx(['employer contact', 'employer contact number', 'company contact', 'company contact number']),
      tanaExpiryIdx: findIdx(['tana', 'tana expiry', 'tana expiry date', 'tana exp']),
      greenIcExpiryIdx: findIdx(['green ic', 'green ic expiry', 'green ic expiry date', 'greenic']),
      remarksIdx: findIdx(['remarks', 'remark', 'notes', 'comments'])
    };
  },

  // Robust date converter
  cleanDate: function (val) {
    if (!val) return '';

    // If it's already a JS Date object (e.g. from SheetJS cellDates option)
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return '';
      return val.toISOString().split('T')[0];
    }

    // If Excel serial number (often parsed as numbers if cellDates is false)
    if (!isNaN(val) && Number(val) > 20000 && Number(val) < 60000) {
      const date = new Date((Number(val) - 25569) * 86400 * 1000);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    }

    const str = String(val).trim();
    if (!str) return '';

    // Check for standard formats
    // Format 1: YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      const d = new Date(str);
      return !isNaN(d.getTime()) ? str : '';
    }

    // Format 2: DD/MM/YYYY or DD-MM-YYYY
    const partsSlash = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (partsSlash) {
      const day = parseInt(partsSlash[1], 10);
      const month = parseInt(partsSlash[2], 10) - 1; // 0-indexed months
      const year = parseInt(partsSlash[3], 10);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime()) && d.getDate() === day && d.getMonth() === month) {
        // Return ISO format
        const mm = String(month + 1).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        return `${year}-${mm}-${dd}`;
      }
    }

    // Format 3: YYYY/MM/DD
    const partsSlashReverse = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (partsSlashReverse) {
      const year = parseInt(partsSlashReverse[1], 10);
      const month = parseInt(partsSlashReverse[2], 10) - 1;
      const day = parseInt(partsSlashReverse[3], 10);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) {
        const mm = String(month + 1).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        return `${year}-${mm}-${dd}`;
      }
    }

    // Fallback: try standard JavaScript Date parsing
    const fallbackDate = new Date(str);
    if (!isNaN(fallbackDate.getTime())) {
      return fallbackDate.toISOString().split('T')[0];
    }

    return ''; // Return empty string if date is completely unparseable
  }
};

window.ExcelHandler = ExcelHandler;

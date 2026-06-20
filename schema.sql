-- Alam Mesra Expiration Tracker MySQL Database Schema

CREATE DATABASE IF NOT EXISTS alam_mesra_db;
USE alam_mesra_db;

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL
);

-- Settings Table (single-row configuration or key-value)
CREATE TABLE IF NOT EXISTS settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  warningDays INT NOT NULL DEFAULT 30,
  criticalDays INT NOT NULL DEFAULT 7,
  defaultEmails TEXT,
  defaultWhatsapp TEXT
);

-- Employees Table
CREATE TABLE IF NOT EXISTS employees (
  id VARCHAR(64) PRIMARY KEY,
  ql DATE NULL,
  name VARCHAR(255) NOT NULL,
  passportNo VARCHAR(64) NOT NULL UNIQUE,
  passportExpiry DATE NULL,
  medicalExpiry DATE NULL,
  insuranceExpiry DATE NULL,
  employmentPassExpiry DATE NULL,
  tanaExpiry DATE NULL,
  greenIcExpiry DATE NULL,
  employer VARCHAR(255) NOT NULL,
  employerContact VARCHAR(255) NOT NULL,
  remarks TEXT,
  contacts JSON NULL
);

-- Notifications Log Table
CREATE TABLE IF NOT EXISTS notifications_log (
  id VARCHAR(64) PRIMARY KEY,
  employeeId VARCHAR(64) NOT NULL,
  employeeName VARCHAR(255) NOT NULL,
  type VARCHAR(32) NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  sentBy VARCHAR(255),
  sentAt DATETIME NOT NULL
);

-- Change Log Table
CREATE TABLE IF NOT EXISTS change_log (
  id VARCHAR(64) PRIMARY KEY,
  timestamp DATETIME NOT NULL,
  user VARCHAR(255) NOT NULL,
  action VARCHAR(64) NOT NULL,
  details JSON NULL
);

-- Insert Default Superadmin User if not exists
INSERT INTO users (id, email, name, password, role)
VALUES ('u_super', 'superadmin@system.com', 'Super Administrator', 'superadmin123', 'superadmin')
ON DUPLICATE KEY UPDATE id=id;

-- Insert Default Settings if not exists
INSERT INTO settings (id, warningDays, criticalDays, defaultEmails, defaultWhatsapp)
VALUES (1, 30, 7, 'manager1@system.com, safety@system.com', '+60123456789, +60198765432')
ON DUPLICATE KEY UPDATE id=id;

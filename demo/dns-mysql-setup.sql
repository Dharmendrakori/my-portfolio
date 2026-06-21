-- DNS Records Table for Aiven MySQL
-- Run this SQL in your Aiven MySQL database to create the table and sample data

-- Create table
CREATE TABLE IF NOT EXISTS `dns_records` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `zone` VARCHAR(255) NOT NULL DEFAULT 'corp.local',
  `name` VARCHAR(255) NOT NULL,
  `type` ENUM('A','CNAME','MX','TXT','NS','PTR','SRV','AAAA') NOT NULL DEFAULT 'A',
  `value` TEXT NOT NULL,
  `ttl` INT NOT NULL DEFAULT 3600,
  `priority` INT DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_zone` (`zone`),
  INDEX `idx_zone_name` (`zone`, `name`),
  INDEX `idx_type` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample data
INSERT INTO `dns_records` (`zone`, `name`, `type`, `value`, `ttl`, `priority`) VALUES
('corp.local', '@', 'A', '10.0.0.10', 3600, NULL),
('corp.local', '@', 'MX', 'mail.corp.local', 3600, 10),
('corp.local', 'www', 'CNAME', 'web01.corp.local', 1800, NULL),
('corp.local', 'mail', 'A', '10.0.0.20', 3600, NULL),
('corp.local', 'web01', 'A', '10.0.0.30', 3600, NULL),
('corp.local', '@', 'TXT', 'v=spf1 include:_spf.google.com ~all', 3600, NULL),
('corp.internal', '@', 'A', '10.1.0.10', 3600, NULL),
('corp.internal', 'dc01', 'A', '10.1.0.5', 3600, NULL),
('corp.external', '@', 'A', '203.0.113.10', 3600, NULL),
('corp.external', 'www', 'A', '203.0.113.20', 3600, NULL);

-- Verify data
SELECT * FROM dns_records;
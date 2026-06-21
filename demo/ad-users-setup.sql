-- AD Users Table Setup for Aiven MySQL
-- Run this SQL in your Aiven MySQL database to add status tracking

-- First, check if the table exists
-- If you already have an ad_users table, you just need to add the status column

-- Add status column if it doesn't exist
-- This uses ENUM to ensure only valid status values are stored
ALTER TABLE `ad_users` 
ADD COLUMN IF NOT EXISTS `status` ENUM('Active', 'Inactive', 'Disabled', 'Pending') 
DEFAULT 'Active' 
AFTER `email`;

-- If your table uses a boolean 'enabled' column instead, use this instead:
-- ALTER TABLE `ad_users` 
-- ADD COLUMN IF NOT EXISTS `enabled` TINYINT(1) NOT NULL DEFAULT 1 
-- AFTER `email`;

-- Update existing users to have a status (if they don't have one)
-- This sets all existing users to 'Active' by default
UPDATE `ad_users` 
SET `status` = 'Active' 
WHERE `status` IS NULL;

-- Verify the table structure
DESCRIBE `ad_users`;

-- Verify the data
SELECT id, cn, email, department, status FROM `ad_users` LIMIT 10;
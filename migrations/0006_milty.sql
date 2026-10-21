-- Optional Milty draft link, its admin passkey (creator and admins only), and the TI Assistant game password.
ALTER TABLE games ADD COLUMN milty_url TEXT;
ALTER TABLE games ADD COLUMN milty_admin_pass TEXT;
ALTER TABLE games ADD COLUMN ti_assistant_password TEXT;

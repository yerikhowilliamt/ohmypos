-- TASK-083 / DEF-A3 — cerminan sisi-entri dari trg_check_allocation_sum.
--
-- Invarian yang ditegakkan:
--   SUM(allocations.amount_portion WHERE status = 'ACTIVE') <= ledger_entries.amount
--
-- URUTAN KUNCI (jangan diubah tanpa membaca rencana TASK-083 §Jebakan):
-- modul alokasi mengunci bank_transactions DAHULU, baru ledger_entries. Kedua
-- trigger BEFORE pada `allocations` dijalankan Postgres menurut urutan ABJAD
-- namanya, dan `trg_check_allocation_sum` < `trg_check_ledger_allocation_sum`,
-- jadi urutan itu terpenuhi. Trigger BEFORE baru pada tabel ini WAJIB dinamai
-- sehingga tidak jatuh di antara keduanya secara abjad.

CREATE OR REPLACE FUNCTION check_ledger_allocation_sum()
RETURNS TRIGGER AS $$
DECLARE
  total_allocated DECIMAL(18,2);
  entry_amount    DECIMAL(18,2);
BEGIN
  SELECT amount INTO entry_amount
  FROM ledger_entries
  WHERE id = NEW.ledger_entry_id
  FOR UPDATE;

  SELECT COALESCE(SUM(amount_portion), 0) INTO total_allocated
  FROM allocations
  WHERE ledger_entry_id = NEW.ledger_entry_id
    AND status = 'ACTIVE'
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000');

  IF (total_allocated + NEW.amount_portion) > entry_amount THEN
    RAISE EXCEPTION
      'Allocation total (%) would exceed ledger entry amount (%) for entry %',
      (total_allocated + NEW.amount_portion), entry_amount, NEW.ledger_entry_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_ledger_allocation_sum ON allocations;

CREATE TRIGGER trg_check_ledger_allocation_sum
BEFORE INSERT OR UPDATE ON allocations
FOR EACH ROW
EXECUTE FUNCTION check_ledger_allocation_sum();

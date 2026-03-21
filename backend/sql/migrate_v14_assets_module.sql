UPDATE user_settings
SET modules_json = JSON_MERGE_PATCH(
  JSON_OBJECT('businesses', TRUE, 'ledger', TRUE, 'assets', TRUE),
  COALESCE(modules_json, JSON_OBJECT())
)
WHERE modules_json IS NULL
   OR JSON_EXTRACT(modules_json, '$.businesses') IS NULL
   OR JSON_EXTRACT(modules_json, '$.ledger') IS NULL
   OR JSON_EXTRACT(modules_json, '$.assets') IS NULL;

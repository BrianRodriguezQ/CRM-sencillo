-- Decisión A.2 (CTO): password_history era un ledger que solo escribía el
-- seed y nadie leía. Se elimina para sacar peso muerto. Si algún día se quiere
-- la política "no reutilizar contraseñas", se vuelve a crear con su política.
DROP TABLE IF EXISTS "password_history";
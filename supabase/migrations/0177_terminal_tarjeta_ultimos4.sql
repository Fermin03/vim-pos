-- 0177 · La terminación de la tarjeta de un cobro con terminal (ADR 0033), para imprimirla en el
-- ticket: «Mastercard **** 1447». Solo los últimos cuatro dígitos; Mercado Pago manda también los
-- primeros ocho y esos no se guardan.
ALTER TABLE terminal_cobros ADD COLUMN IF NOT EXISTS tarjeta_ultimos4 varchar(4) NULL
  CONSTRAINT terminal_cobro_ultimos4_valido CHECK (tarjeta_ultimos4 ~ '^[0-9]{4}$');

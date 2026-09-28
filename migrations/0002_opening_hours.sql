-- Jadwal operasional toko dalam JSON: {"timezone":"Asia/Jakarta","days":[null|{"open":"08:00","close":"21:00"} x7]}
-- (indeks 0 = Minggu). NULL = belum diatur → toko dianggap selalu buka (perilaku sebelum fitur ini).
ALTER TABLE stores ADD COLUMN opening_hours TEXT;

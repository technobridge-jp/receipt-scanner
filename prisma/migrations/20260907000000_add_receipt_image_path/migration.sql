-- AXIS証憑管理機能: レシート画像(Supabase Storage)へのパスを保持する列を追加
ALTER TABLE "Receipt" ADD COLUMN "imagePath" TEXT;

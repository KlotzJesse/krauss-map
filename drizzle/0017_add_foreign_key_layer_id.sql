-- Add foreign key constraint for layer_id to prevent orphaned postal codes
ALTER TABLE "area_layer_postal_codes" 
  ADD CONSTRAINT "fk_area_layer_postal_codes_layer_id" FOREIGN KEY ("layer_id") 
  REFERENCES "area_layers"("id") ON DELETE CASCADE;


-- AddForeignKey
ALTER TABLE "follow_up_schema"."follow_ups" ADD CONSTRAINT "follow_ups_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "conversation_schema"."clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

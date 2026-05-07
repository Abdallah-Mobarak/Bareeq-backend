-- Drop columns not present in FRD §4.2.1.2 / §4.2.3.2.
-- The role only carries `name` + selected permissions; the user picks
-- any role from a unified list when creating a manager or admin.

ALTER TABLE "permission_roles" DROP COLUMN "applies_to";
ALTER TABLE "permission_roles" DROP COLUMN "description";

-- CreateIndex
CREATE UNIQUE INDEX "permission_roles_name_key" ON "permission_roles"("name");

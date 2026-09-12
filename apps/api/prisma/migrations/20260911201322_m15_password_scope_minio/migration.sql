-- AlterTable
ALTER TABLE "AdminRole" ADD COLUMN     "dataScope" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN     "passwordUpdatedAt" VARCHAR(16);

-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN     "minioAccessKey" VARCHAR(128) NOT NULL DEFAULT '',
ADD COLUMN     "minioBucket" VARCHAR(64) NOT NULL DEFAULT 'joinyuu',
ADD COLUMN     "minioEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "minioEndpoint" VARCHAR(255) NOT NULL DEFAULT '',
ADD COLUMN     "minioPort" INTEGER NOT NULL DEFAULT 9000,
ADD COLUMN     "minioSecretKey" VARCHAR(128) NOT NULL DEFAULT '',
ADD COLUMN     "minioUseSsl" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordExpireDays" INTEGER NOT NULL DEFAULT 90;

-- AddForeignKey
ALTER TABLE "AdminUserRole" ADD CONSTRAINT "AdminUserRole_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminUserRole" ADD CONSTRAINT "AdminUserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AdminRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminRolePermission" ADD CONSTRAINT "AdminRolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AdminRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

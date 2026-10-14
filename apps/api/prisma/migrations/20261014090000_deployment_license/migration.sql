CREATE TABLE "DeploymentLicense" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "deploymentId" TEXT NOT NULL,
  "document" JSONB,
  "importedAt" TIMESTAMP(3),
  CONSTRAINT "DeploymentLicense_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeploymentLicense_deploymentId_key" ON "DeploymentLicense"("deploymentId");

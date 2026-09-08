import { CatalogService } from "./catalog.service.js";
import { CatalogController } from "./catalog.controller.js";
import { CatalogRepository } from "./catalog.repository.js";
import { ResolveService } from "./resolve.service.js";
import { ResolveController } from "./resolve.controller.js";
import { ResolveRepository } from "./resolve.repository.js";
import { RoutingService } from "./routing.service.js";
import { RoutingController } from "./routing.controller.js";
import { RoutingRepository } from "./routing.repository.js";
import { CacheModule } from "../../cache/cache.module.js";
import { RevisionService } from "./revision.service.js";
import { RevisionController } from "./revision.controller.js";
import { RevisionRepository } from "./revision.repository.js";
import { LabelService } from "./label.service.js";
import { LabelController } from "./label.controller.js";
import { LabelRepository } from "./label.repository.js";
import { FeatureReferenceRepository } from "./feature-reference.repository.js";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { ModelGenerationRepository } from "./model-generation.repository.js";
import { DefinitionController } from "./definition.controller.js";
import { DefinitionService } from "./definition.service.js";
import { DefinitionRepository } from "./definition.repository.js";
import { ProviderController } from "./provider.controller.js";
import { ProviderService } from "./provider.service.js";
import { ProviderRepository } from "./provider.repository.js";
import { HealthController } from "./health.controller.js";
import { HealthService } from "./health.service.js";
import { HealthRepository } from "./health.repository.js";
@Module({
  imports: [DatabaseModule, CacheModule],
  providers: [
    CatalogRepository,
    CatalogService,
    ResolveRepository,
    ResolveService,
    RoutingRepository,
    RoutingService,
    RevisionRepository,
    RevisionService,
    LabelRepository,
    LabelService,
    FeatureReferenceRepository,
    ModelGenerationRepository,
    DefinitionService,
    DefinitionRepository,
    ProviderService,
    ProviderRepository,
    HealthService,
    HealthRepository,
  ],
  controllers: [
    CatalogController,
    ResolveController,
    RoutingController,
    RevisionController,
    LabelController,
    DefinitionController,
    ProviderController,
    HealthController,
  ],
})
export class ModelCatalogModule {}

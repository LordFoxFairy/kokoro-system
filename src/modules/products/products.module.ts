import { ProductProjectionRepository } from "./product-projection.repository.js";
import { ProductProjectionService } from "./product-projection.service.js";
import { BindingService } from "./binding.service.js";
import { BindingController } from "./binding.controller.js";
import { BindingRepository } from "./binding.repository.js";
import { ReleaseService } from "./release.service.js";
import { ReleaseController } from "./release.controller.js";
import { ReleaseRepository } from "./release.repository.js";
import { ConfigRepository } from "./config.repository.js";
import { ConfigService } from "./config.service.js";
import { ConfigController } from "./config.controller.js";
import { PresentationRepository } from "./presentation.repository.js";
import { PresentationService } from "./presentation.service.js";
import { PresentationController } from "./presentation.controller.js";
import { ExposureRepository } from "./exposure.repository.js";
import { ExposureService } from "./exposure.service.js";
import { ExposureController } from "./exposure.controller.js";
import { FeatureRepository } from "./feature.repository.js";
import { FeatureService } from "./feature.service.js";
import { FeatureController } from "./feature.controller.js";
import { ApplicationRepository } from "./application.repository.js";
import { ApplicationService } from "./application.service.js";
import { ApplicationController } from "./application.controller.js";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { ProductRepository } from "./product.repository.js";
import { ProductService } from "./product.service.js";
import { ProductController } from "./product.controller.js";
@Module({
  imports: [DatabaseModule],
  providers: [
    ProductProjectionRepository,
    ProductProjectionService,
    BindingService,
    BindingRepository,
    ReleaseService,
    ReleaseRepository,
    ConfigRepository,
    ConfigService,
    PresentationRepository,
    PresentationService,
    ExposureRepository,
    ExposureService,
    FeatureRepository,
    FeatureService,
    ProductRepository,
    ProductService,
    ApplicationRepository,
    ApplicationService,
  ],
  controllers: [
    BindingController,
    ReleaseController,
    ConfigController,
    PresentationController,
    ExposureController,
    FeatureController,
    ProductController,
    ApplicationController,
  ],
  exports: [
    ProductProjectionService,
    BindingService,
    ReleaseService,
    ConfigService,
    PresentationService,
    ExposureService,
    FeatureService,
    ProductService,
    ApplicationService,
  ],
})
export class ProductsModule {}

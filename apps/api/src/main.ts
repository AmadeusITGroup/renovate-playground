import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { HttpExceptionFilter } from './app/common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });
  
  // Apply global exception filter to ensure all errors are caught
  app.useGlobalFilters(new HttpExceptionFilter());
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  // Serve static files from UI build output
  const uiDistPath = join(__dirname, '..', '..', 'ui');
  app.useStaticAssets(uiDistPath);
  app.setBaseViewsDir(uiDistPath);
  app.setViewEngine('html');

  // Enable CORS with environment-specific configuration
  const corsOrigins = process.env.NODE_ENV === 'production' 
    ? [process.env.FRONTEND_URL || `http://localhost:${process.env.PORT || 3333}`]
    : ['http://localhost:4200'];
    
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'Cache-Control',
      'X-HTTP-Method-Override',
    ],
    exposedHeaders: ['Content-Type', 'Cache-Control'],
  });

  // Add catch-all route for Angular app (must be after API routes)
  app.use((req, res, next) => {
    if (req.originalUrl.startsWith('/api')) {
      return next();
    }
    const indexPath = join(__dirname, '..', '..', 'ui', 'index.html');
    res.sendFile(indexPath);
  });

  const port = process.env.PORT || 3333;
  await app.listen(port);

  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`
  );
  Logger.log(
    `📱 Frontend is served at: http://localhost:${port}`
  );
}

bootstrap().catch((err) => {
  console.error('Error starting server:', err);
  process.exit(1);
});

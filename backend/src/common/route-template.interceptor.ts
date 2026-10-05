import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';

import { RequestLike } from './request-log';

/**
 * Guarda la plantilla de la ruta (p. ej. /api/challenges/:id) mientras corre el handler, para
 * que la línea de acceso no dependa de que Express conserve req.route al cerrar la respuesta.
 */
@Injectable()
export class RouteTemplateInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const req = context.switchToHttp().getRequest<Request & RequestLike>();
      const path = (req.route as { path?: unknown } | undefined)?.path;
      if (typeof path === 'string') req.routeTemplate = path;
    }
    return next.handle();
  }
}

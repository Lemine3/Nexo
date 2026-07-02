import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

export interface AccessTokenPayload {
  sub: string; // staffUserId
  tenantId: string;
  type: 'access';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  // Identity only — permissions are always re-resolved server-side per
  // request from the source of truth (docs/srs/02 §2.7, docs/srs/13 §13.2).
  validate(payload: AccessTokenPayload): AuthenticatedUser {
    return { staffUserId: payload.sub, tenantId: payload.tenantId };
  }
}

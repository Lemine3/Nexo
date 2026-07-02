import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import { ActorType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RbacProvisioningService } from '../rbac/rbac-provisioning.service';
import { AuditLogService } from '../audit/audit-log.service';
import { parseDurationMs } from '../common/utils/duration';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MS = 15 * 60_000;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly rbacProvisioningService: RbacProvisioningService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Bootstraps a brand-new tenant with its Owner account (docs/srs/02 §2.2)
   * and seeds the default system roles (docs/srs/02 §2.3). There is exactly
   * one Owner per tenant, created here; all subsequent staff users are
   * invited via StaffUsersService and are never isOwner.
   */
  async register(dto: RegisterDto): Promise<TokenPair & { tenantId: string; staffUserId: string }> {
    const passwordHash = await argon2.hash(dto.password);

    const { tenant, staffUser } = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: dto.tenantName } });
      const staffUser = await tx.staffUser.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          passwordHash,
          isOwner: true,
          status: 'ACTIVE',
        },
      });
      await tx.tenant.update({ where: { id: tenant.id }, data: { ownerStaffUserId: staffUser.id } });
      return { tenant, staffUser };
    });

    await this.rbacProvisioningService.provisionSystemRolesForTenant(tenant.id);

    await this.auditLogService.record({
      tenantId: tenant.id,
      actorType: ActorType.STAFF,
      actorId: staffUser.id,
      action: 'tenant.bootstrap',
      resourceType: 'tenant',
      resourceId: tenant.id,
      after: { tenantName: tenant.name, ownerEmail: staffUser.email },
    });

    const tokens = await this.issueTokenPair(staffUser.id, tenant.id);
    return { ...tokens, tenantId: tenant.id, staffUserId: staffUser.id };
  }

  /**
   * SIMPLIFICATION: resolves the account by email alone (first match) rather
   * than requiring a tenant/subdomain selector first — acceptable for a
   * single-tenant-per-deployment demo; a production multi-tenant login
   * screen would resolve tenant context before matching credentials
   * (docs/srs/03 §3.6 store switcher is the analogous production pattern).
   */
  async login(dto: LoginDto, meta: { ipAddress?: string; userAgent?: string } = {}): Promise<TokenPair> {
    const staffUser = await this.prisma.staffUser.findFirst({ where: { email: dto.email } });
    if (!staffUser) throw new UnauthorizedException('Invalid credentials');

    if (staffUser.lockedUntil && staffUser.lockedUntil > new Date()) {
      throw new UnauthorizedException('Account temporarily locked due to repeated failed logins');
    }

    const passwordValid = await argon2.verify(staffUser.passwordHash, dto.password);
    if (!passwordValid) {
      await this.registerFailedLogin(staffUser.id);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (staffUser.status !== 'ACTIVE') {
      throw new UnauthorizedException(`Account is ${staffUser.status.toLowerCase()}`);
    }

    await this.prisma.staffUser.update({
      where: { id: staffUser.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    await this.auditLogService.record({
      tenantId: staffUser.tenantId,
      actorType: ActorType.STAFF,
      actorId: staffUser.id,
      action: 'auth.login',
      resourceType: 'staff_user',
      resourceId: staffUser.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return this.issueTokenPair(staffUser.id, staffUser.tenantId, meta);
  }

  private async registerFailedLogin(staffUserId: string): Promise<void> {
    const updated = await this.prisma.staffUser.update({
      where: { id: staffUserId },
      data: { failedLoginCount: { increment: 1 } },
    });
    if (updated.failedLoginCount >= MAX_FAILED_LOGINS) {
      await this.prisma.staffUser.update({
        where: { id: staffUserId },
        data: { lockedUntil: new Date(Date.now() + LOCKOUT_MS) },
      });
    }
  }

  /**
   * Refresh token rotation with reuse detection (docs/srs/13 §13.1.1): the
   * opaque token is `${sessionId}.${secret}`. Presenting an already-rotated
   * (revoked) session's token revokes the whole family and signals theft.
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const [sessionId, secret] = refreshToken.split('.');
    if (!sessionId || !secret) throw new UnauthorizedException('Malformed refresh token');

    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new UnauthorizedException('Invalid refresh token');

    if (session.revokedAt) {
      // Reuse of a rotated-out token: revoke the entire session family.
      await this.prisma.session.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected; all sessions revoked');
    }

    if (session.expiresAt < new Date()) throw new UnauthorizedException('Refresh token expired');
    if (this.hashSecret(secret) !== session.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });

    return this.issueTokenPair(session.staffUserId, (await this.requireTenantId(session.staffUserId)), {
      familyId: session.familyId,
    });
  }

  async logout(refreshToken: string): Promise<void> {
    const [sessionId] = refreshToken.split('.');
    if (!sessionId) return;
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async requireTenantId(staffUserId: string): Promise<string> {
    const staffUser = await this.prisma.staffUser.findUniqueOrThrow({ where: { id: staffUserId } });
    return staffUser.tenantId;
  }

  private hashSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  private async issueTokenPair(
    staffUserId: string,
    tenantId: string,
    opts: { ipAddress?: string; userAgent?: string; familyId?: string } = {},
  ): Promise<TokenPair> {
    const accessToken = await this.jwtService.signAsync(
      { sub: staffUserId, tenantId, type: 'access' },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m'),
      },
    );

    const refreshSecret = randomBytes(32).toString('base64url');
    const refreshTtlMs = parseDurationMs(this.config.get<string>('JWT_REFRESH_TTL', '30d'));
    const session = await this.prisma.session.create({
      data: {
        id: randomUUID(),
        staffUserId,
        refreshTokenHash: this.hashSecret(refreshSecret),
        familyId: opts.familyId ?? randomUUID(),
        ipAddress: opts.ipAddress,
        userAgent: opts.userAgent,
        expiresAt: new Date(Date.now() + refreshTtlMs),
      },
    });

    return { accessToken, refreshToken: `${session.id}.${refreshSecret}` };
  }
}

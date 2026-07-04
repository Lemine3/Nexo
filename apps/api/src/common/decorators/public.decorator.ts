import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks an endpoint as not requiring authentication (e.g. login/register). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

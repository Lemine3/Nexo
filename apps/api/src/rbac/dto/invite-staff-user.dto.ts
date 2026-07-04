import { IsEmail } from 'class-validator';

export class InviteStaffUserDto {
  @IsEmail()
  email!: string;
}

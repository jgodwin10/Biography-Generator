import { IsString, IsOptional, IsInt, Min, Max, IsEnum, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({ example: 'Marie Curie: A Life in Two Elements' })
  @IsString()
  title: string;

  @ApiProperty({
    example: 'From a Warsaw Classroom to Two Nobel Prizes',
    required: false,
  })
  @IsString()
  @IsOptional()
  subtitle?: string;

  @ApiProperty({ example: 'John Smith' })
  @IsString()
  author: string;

  @ApiProperty({ example: 'Marie Curie', required: false })
  @IsString()
  @IsOptional()
  subject?: string;

  @ApiProperty({
    example: 'Author notes: focus on her years in Paris.',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 12, default: 12, minimum: 5, maximum: 30 })
  @IsInt()
  @Min(5)
  @Max(30)
  @IsOptional()
  numberOfChapters?: number = 12;

  @ApiProperty({ 
    example: 'MEDIUM',
    enum: ['SHORT', 'MEDIUM', 'LONG'],
    default: 'MEDIUM'
  })
  @IsEnum(['SHORT', 'MEDIUM', 'LONG'])
  @IsOptional()
  contentLength?: string = 'MEDIUM';

  @ApiProperty({ example: 'uuid-here', required: false })
  @IsUUID()
  @IsOptional()
  userId?: string;
}

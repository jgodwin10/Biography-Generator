import {
  IsString,
  IsOptional,
  IsArray,
  IsUUID,
  IsNotEmpty,
  MaxLength,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBookDto {
  @IsUUID()
  userId: string;

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

  @ApiProperty({
    example: 'Marie Curie',
    description: 'Full name of the person the biography is about',
  })
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiProperty({
    example: 'Focus on her years in Paris and her work with Pierre.',
    description:
      'Optional facts or direction. The writer treats these as verified facts.',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(4000)
  notes?: string;

  @ApiProperty({ example: 12, default: 12, minimum: 5, maximum: 30 })
  @IsInt()
  @Min(5)
  @Max(30)
  @IsOptional()
  numberOfChapters?: number = 12;

  // Images are handled by @UseInterceptors, not the DTO

  @ApiProperty({
    example: ['Chapter 1 image', 'Chapter 2 image'],
    description: 'Captions for each image (optional)',
    required: false,
    type: [String],
  })
  @IsArray()
  @IsOptional()
  imageCaptions?: string[];

  @ApiProperty({
    example: [1, 2, 2, 3, 3, 3, 4, 5, 5, 6],
    description:
      'Chapter numbers for each image (if not provided, auto-distributed)',
    required: false,
    type: [Number],
  })
  @IsArray()
  @IsOptional()
  imageChapterNumbers?: number[];
}

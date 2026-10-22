import { IsString, IsOptional, IsArray, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateBiographyDto {
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
  subject: string;

  @ApiProperty({
    example: 'Focus on her years in Paris and her work with Pierre.',
    description:
      'Optional facts or direction from the author. Treated as verified facts by the writer.',
    required: false,
  })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ example: 12, default: 12, minimum: 5, maximum: 30 })
  @IsInt()
  @Min(5)
  @Max(30)
  @IsOptional()
  numberOfChapters?: number = 12;
}

export class BookOutlineDto {
  @ApiProperty()
  title: string;

  @ApiProperty()
  subtitle?: string;

  @ApiProperty()
  author: string;

  @ApiProperty({ type: [Object] })
  chapters: ChapterOutline[];
}

export class ChapterOutline {
  chapterNumber: number;
  chapterTitle: string;
  sections: SectionOutline[];
}

export class SectionOutline {
  sectionTitle: string;
  subsections: string[];
}
import {
  Controller,
  Post,
  Body,
  Param,
  Get,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { GenerateBiographyDto } from './dto/generate-biography.dto';
import { ContentService } from './content.service';

@ApiTags('content')
@Controller('content')
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Post('generate-biography/:projectId')
  @ApiOperation({
    summary: 'Generate a complete English biography',
    description: `Generates a narrative nonfiction biography following this 5-step process:

Step 1: Create a chronological 12-chapter outline of the subject's life
Step 2: Write the Introduction around one defining, documented moment
Step 3: Write each life chapter in order, as narrative prose
Step 4: Write the Conclusion on legacy, with a key-dates timeline
Step 5: Add copyright, about-the-book and table of contents

Prompts forbid invented quotes, dialogue and private thoughts, and treat author notes as verified facts.`,
  })
  @ApiResponse({
    status: 201,
    description: 'Biography generation started. Returns job ID for tracking.',
  })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async generateBiography(
    @Param('projectId') projectId: string,
    @Body() generateDto: GenerateBiographyDto,
  ) {
    return await this.contentService.generateBiographyBook(projectId, generateDto);
  }

  @Get('status/:jobId')
  @ApiOperation({ summary: 'Get book generation job status and progress' })
  @ApiResponse({ 
    status: 200, 
    description: 'Job status with progress percentage (0-100)' 
  })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getStatus(@Param('jobId') jobId: string) {
    return await this.contentService.getGenerationStatus(jobId);
  }
}
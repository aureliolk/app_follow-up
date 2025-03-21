// app/api/follow-up/update-step/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * API Route for updating a funnel step
 * PUT /api/follow-up/update-step
 */
export async function PUT(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    
    // Validate required fields
    if (!body.id) {
      return NextResponse.json({ 
        success: false, 
        error: 'Step ID is required' 
      }, { status: 400 });
    }

    // Extract all fields we need to update
    const {
      id,
      funnel_stage_id,
      template_name,
      wait_time, 
      message_content,
      message_category = 'Utility',
      auto_respond = true
    } = body;

    // Log received data for debugging
    console.log('Updating step with data:', {
      id,
      funnel_stage_id,
      template_name,
      wait_time,
      message_category
    });

    // First check if the step exists
    const existingStep = await prisma.funnelStep.findUnique({
      where: { id },
    });

    if (!existingStep) {
      return NextResponse.json({ 
        success: false, 
        error: `Step with ID ${id} not found` 
      }, { status: 404 });
    }

    // Update the step with new data
    const updatedStep = await prisma.funnelStep.update({
      where: { id },
      data: {
        funnel_stage_id: funnel_stage_id || existingStep.funnel_stage_id,
        name: template_name || existingStep.name,
        template_name: template_name || existingStep.template_name,
        wait_time: wait_time || existingStep.wait_time,
        message_content: message_content || existingStep.message_content,
        message_category: message_category || existingStep.message_category,
        auto_respond: auto_respond !== undefined ? auto_respond : existingStep.auto_respond
      }
    });

    // Return updated step
    return NextResponse.json({
      success: true,
      message: 'Step updated successfully',
      data: updatedStep
    });
  } catch (error: any) {
    console.error('Error updating step:', error);
    
    return NextResponse.json({
      success: false,
      error: `Failed to update step: ${error.message}`
    }, { status: 500 });
  }
}
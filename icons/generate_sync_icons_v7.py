#!/usr/bin/env python3
"""
Generate Chrome Web Store compliant synchronization icons with rounded square background.
This script creates PNG icons that follow Chrome Web Store guidelines with exact 16px padding.
Version 7: Rounded square background, exact 16px padding, maximum content size.
"""

import os
from PIL import Image, ImageDraw
import math

def create_sync_icon(size):
    """Create a Chrome Web Store compliant synchronization icon at the specified size."""
    # Create a new image with transparent background
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Calculate scaling factor based on 128px base size
    scale = size / 128
    
    # For 128px icon: 96x96 actual icon + exactly 16px padding on each side
    # For other sizes: proportional scaling
    if size == 128:
        actual_icon_size = 96
        padding = 16
    else:
        actual_icon_size = int(96 * scale)
        padding = int(16 * scale)
    
    # Calculate the actual icon area with exact 16px padding
    icon_left = padding
    icon_right = size - padding
    icon_top = padding
    icon_bottom = size - padding
    center = size // 2
    
    # Rounded square background - use the full 96x96 area with exact 16px padding
    corner_radius = int(16 * scale)  # Rounded corners (16px for 128px icon)
    
    # Use the exact 96x96 area with no additional margin
    # For 128px: left=16, top=16, right=111, bottom=111 (96x96 area)
    draw.rounded_rectangle([icon_left, icon_top, icon_right - 1, icon_bottom - 1], 
                          radius=corner_radius, fill=(248, 249, 250, 255))
    
    # Vertical alignment marker - ensure 16px padding
    line_width = max(1, int(4 * scale))
    line_y_start = icon_top + int(20 * scale)  # Ensure 16px padding
    line_y_end = icon_bottom - int(20 * scale)  # Ensure 16px padding
    draw.line([center, line_y_start, center, line_y_end], 
              fill=(64, 64, 64, 255), width=line_width)
    
    # Analog clock icon at the top of the vertical line - move up
    clock_center_y = icon_top + int(20 * scale)  # Move up to create more space
    clock_radius = int(18 * scale)  # Smaller to ensure 16px padding
    
    # Clock face - white with subtle dark outline
    draw.ellipse([center - clock_radius, clock_center_y - clock_radius, 
                 center + clock_radius, clock_center_y + clock_radius], 
                 fill=(255, 255, 255, 255), outline=(64, 64, 64, 255), width=max(1, int(3 * scale)))
    
    # Clock hands - showing 2:30
    # Hour hand (shorter) - pointing to 2 o'clock
    hour_angle = math.radians(60)
    hour_hand_length = int(12 * scale)  # Longer hands
    hour_hand_end_x = center + int(hour_hand_length * math.sin(hour_angle))
    hour_hand_end_y = clock_center_y - int(hour_hand_length * math.cos(hour_angle))
    draw.line([center, clock_center_y, hour_hand_end_x, hour_hand_end_y], 
              fill=(64, 64, 64, 255), width=max(1, int(3 * scale)))
    
    # Minute hand (longer) - pointing to 6 (30 minutes)
    minute_angle = math.radians(180)
    minute_hand_length = int(18 * scale)  # Longer hands
    minute_hand_end_x = center + int(minute_hand_length * math.sin(minute_angle))
    minute_hand_end_y = clock_center_y - int(minute_hand_length * math.cos(minute_angle))
    draw.line([center, clock_center_y, minute_hand_end_x, minute_hand_end_y], 
              fill=(64, 64, 64, 255), width=max(1, int(3 * scale)))
    
    # Clock center dot
    center_dot_radius = max(1, int(3 * scale))
    draw.ellipse([center - center_dot_radius, clock_center_y - center_dot_radius, 
                 center + center_dot_radius, clock_center_y + center_dot_radius], 
                 fill=(64, 64, 64, 255))
    
    # Optional: Add hour markers for better clock appearance
    if size >= 32:  # Only add hour markers for larger icons
        for hour in range(12):
            angle = math.radians(hour * 30)  # Each hour is 30 degrees
            marker_length = int(4 * scale)
            marker_start_x = center + int((clock_radius - marker_length) * math.sin(angle))
            marker_start_y = clock_center_y - int((clock_radius - marker_length) * math.cos(angle))
            marker_end_x = center + int(clock_radius * math.sin(angle))
            marker_end_y = clock_center_y - int(clock_radius * math.cos(angle))
            draw.line([marker_start_x, marker_start_y, marker_end_x, marker_end_y], 
                     fill=(64, 64, 64, 255), width=max(1, int(1 * scale)))
    
    # Timeline bars - more bars to use maximum space
    bar_height = max(1, int(8 * scale))  # Taller bars
    bar_radius = max(1, int(4 * scale))
    
    # Define bar positions - mix of edge and center positions for natural look
    # For 128px: content area is x=16 to x=111 (96 pixels wide), y=16 to y=111 (96 pixels high)
    bars = [
        # (center_offset, y_pos, width, color)
        (int(-20 * scale), icon_top + int(40 * scale), int(40 * scale), (0, 123, 255, 255)),     # Blue - left edge
        (int(8 * scale), icon_top + int(50 * scale), int(16 * scale), (0, 123, 255, 255)),       # Blue - center-right
        (int(-22 * scale), icon_top + int(60 * scale), int(44 * scale), (40, 167, 69, 255)),    # Green - left edge
        (int(-5 * scale), icon_top + int(70 * scale), int(10 * scale), (40, 167, 69, 255)),     # Green - center-left
        (int(20 * scale), icon_top + int(80 * scale), int(40 * scale), (0, 123, 255, 255)),     # Blue - right edge
    ]
    
    # Draw timeline bars - use the full content area width
    for center_offset, y_pos, width, color in bars:
        x_start = center + center_offset - width
        x_end = center + center_offset + width
        
        # Clamp to content area boundaries but use full width
        x_start = max(icon_left, x_start)
        x_end = min(icon_right - 1, x_end)
        
        # Only draw if there's valid space
        if x_start < x_end:
            draw.rounded_rectangle([x_start, y_pos, x_end, y_pos + bar_height], 
                                  radius=bar_radius, fill=color)
    
    # Draw synchronization dots
    dot_radius = max(1, int(3 * scale))  # Larger dots
    dot_y_positions = [icon_top + int(40 * scale), icon_top + int(50 * scale), 
                      icon_top + int(60 * scale), icon_top + int(70 * scale), icon_top + int(80 * scale)]
    
    for y_pos in dot_y_positions:
        draw.ellipse([center - dot_radius, y_pos - dot_radius, 
                     center + dot_radius, y_pos + dot_radius], 
                     fill=(64, 64, 64, 255))
    
    # Optional: Subtle connecting lines to emphasize synchronization
    if size >= 32:  # Only add connecting lines for larger icons
        for i, y_pos in enumerate(dot_y_positions[:-1]):
            next_y = dot_y_positions[i + 1]
            draw.line([center, y_pos, center, next_y], 
                     fill=(0, 123, 255, 100), width=max(1, int(1 * scale)))
    
    # Add subtle white outer glow for dark backgrounds (only for 128px)
    if size == 128:
        # Create a subtle glow effect
        glow_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        glow_draw = ImageDraw.Draw(glow_img)
        
        # Draw a slightly larger, semi-transparent white rounded rectangle
        # Ensure glow doesn't exceed 16px padding
        glow_margin = int(1 * scale)  # Smaller glow margin
        glow_corner_radius = corner_radius + int(1 * scale)
        glow_left = max(icon_left - glow_margin, padding)
        glow_top = max(icon_top - glow_margin, padding)
        glow_right = min(icon_right + glow_margin, size - padding)
        glow_bottom = min(icon_bottom + glow_margin, size - padding)
        
        glow_draw.rounded_rectangle([glow_left, glow_top, glow_right, glow_bottom], 
                                  radius=glow_corner_radius, 
                                  fill=(255, 255, 255, 15))  # Very subtle white glow
        
        # Composite the glow with the main image
        img = Image.alpha_composite(glow_img, img)
    
    return img

def main():
    """Generate all required icon sizes."""
    # Create icons directory if it doesn't exist
    os.makedirs('icons', exist_ok=True)
    
    # Required sizes for Chrome extension
    sizes = [16, 32, 48, 128]
    
    print("Generating Chrome Web Store compliant synchronization icons with exact 16px padding...")
    
    for size in sizes:
        print(f"Creating {size}x{size} compliant icon...")
        icon = create_sync_icon(size)
        icon.save(f'icons/icon_{size}.png', 'PNG', optimize=True)
    
    print("All compliant icons generated successfully!")
    print("Generated files:")
    for size in sizes:
        print(f"  - icons/icon_{size}.png")
    
    print("\nChrome Web Store compliance features:")
    print("✓ 128x128 icon with 96x96 actual content + exactly 16px padding")
    print("✓ Rounded square background with maximum content size")
    print("✓ No content touching the 16px padding area")
    print("✓ Subtle white outer glow for dark backgrounds")
    print("✓ Works well on both light and dark backgrounds")

if __name__ == "__main__":
    main()
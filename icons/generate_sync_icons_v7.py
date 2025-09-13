#!/usr/bin/env python3
"""
Generate synchronization icons in all required sizes from SVG design.
This script creates PNG icons for the VOD Synchronizer Chrome extension.
Version 7: Irregular blue/green color pattern, source code preserved.
"""

import os
from PIL import Image, ImageDraw
import math

def create_sync_icon(size):
    """Create a synchronization icon at the specified size."""
    # Create a new image with transparent background
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Calculate scaling factor based on 512px base size
    scale = size / 512
    
    # Minimal padding - almost fill the entire icon
    center = size // 2
    radius = int(255 * scale)  # Almost full size (only 1px padding on each side)
    draw.ellipse([center - radius, center - radius, center + radius, center + radius], 
                 fill=(248, 249, 250, 255), outline=(233, 236, 239, 255), width=max(1, int(2 * scale)))
    
    # Vertical alignment marker - almost full height
    line_width = max(1, int(5 * scale))  # Thicker line
    line_y_start = int(60 * scale)   # Minimal top padding
    line_y_end = int(452 * scale)    # Minimal bottom padding
    draw.line([center, line_y_start, center, line_y_end], 
              fill=(108, 117, 125, 255), width=line_width)
    
    # Analog clock icon at the top of the vertical line - larger
    clock_center_y = int(80 * scale)
    clock_radius = int(35 * scale)  # Much larger clock
    
    # Clock face
    draw.ellipse([center - clock_radius, clock_center_y - clock_radius, 
                 center + clock_radius, clock_center_y + clock_radius], 
                 fill=(255, 255, 255, 255), outline=(108, 117, 125, 255), width=max(1, int(4 * scale)))
    
    # Clock hands - showing 2:30 (hour hand at 2, minute hand at 6)
    # Hour hand (shorter) - pointing to 2 o'clock
    hour_angle = math.radians(60)  # 2 o'clock = 60 degrees from 12
    hour_hand_length = int(18 * scale)  # Longer hands
    hour_hand_end_x = center + int(hour_hand_length * math.sin(hour_angle))
    hour_hand_end_y = clock_center_y - int(hour_hand_length * math.cos(hour_angle))
    draw.line([center, clock_center_y, hour_hand_end_x, hour_hand_end_y], 
              fill=(108, 117, 125, 255), width=max(1, int(4 * scale)))
    
    # Minute hand (longer) - pointing to 6 (30 minutes)
    minute_angle = math.radians(180)  # 6 o'clock = 180 degrees from 12
    minute_hand_length = int(26 * scale)  # Longer hands
    minute_hand_end_x = center + int(minute_hand_length * math.sin(minute_angle))
    minute_hand_end_y = clock_center_y - int(minute_hand_length * math.cos(minute_angle))
    draw.line([center, clock_center_y, minute_hand_end_x, minute_hand_end_y], 
              fill=(108, 117, 125, 255), width=max(1, int(4 * scale)))
    
    # Clock center dot
    center_dot_radius = max(1, int(5 * scale))
    draw.ellipse([center - center_dot_radius, clock_center_y - center_dot_radius, 
                 center + center_dot_radius, clock_center_y + center_dot_radius], 
                 fill=(108, 117, 125, 255))
    
    # Optional: Add hour markers for better clock appearance
    if size >= 32:  # Only add hour markers for larger icons
        for hour in range(12):
            angle = math.radians(hour * 30)  # Each hour is 30 degrees
            marker_length = int(6 * scale)
            marker_start_x = center + int((clock_radius - marker_length) * math.sin(angle))
            marker_start_y = clock_center_y - int((clock_radius - marker_length) * math.cos(angle))
            marker_end_x = center + int(clock_radius * math.sin(angle))
            marker_end_y = clock_center_y - int(clock_radius * math.cos(angle))
            draw.line([marker_start_x, marker_start_y, marker_end_x, marker_end_y], 
                     fill=(108, 117, 125, 255), width=max(1, int(2 * scale)))
    
    # Timeline bars with different lengths AND different horizontal positions
    bar_height = max(2, int(18 * scale))  # Much taller bars
    bar_radius = max(1, int(9 * scale))
    
    # Define bar positions and widths - each bar has different center offset
    # Irregular blue and green color pattern
    bars = [
        # (center_offset, y_pos, width, color) - center_offset moves bar left/right
        (int(-35 * scale), int(140 * scale), int(90 * scale), (0, 123, 255, 255)),     # Blue
        (int(25 * scale), int(180 * scale), int(110 * scale), (0, 123, 255, 255)),     # Blue (consecutive)
        (int(-45 * scale), int(220 * scale), int(130 * scale), (40, 167, 69, 255)),    # Green
        (int(35 * scale), int(260 * scale), int(150 * scale), (40, 167, 69, 255)),     # Green (consecutive)
        (int(-25 * scale), int(300 * scale), int(100 * scale), (0, 123, 255, 255)),    # Blue
        (int(30 * scale), int(340 * scale), int(80 * scale), (40, 167, 69, 255)),      # Green
        (int(-40 * scale), int(380 * scale), int(60 * scale), (0, 123, 255, 255)),     # Blue
        (int(20 * scale), int(420 * scale), int(70 * scale), (40, 167, 69, 255)),      # Green
    ]
    
    # Draw timeline bars
    for center_offset, y_pos, width, color in bars:
        x_start = center + center_offset - width
        x_end = center + center_offset + width
        draw.rounded_rectangle([x_start, y_pos, x_end, y_pos + bar_height], 
                              radius=bar_radius, fill=color)
    
    # Draw synchronization dots at the alignment point (center line)
    dot_radius = max(1, int(7 * scale))  # Much larger dots
    dot_y_positions = [int(140 * scale), int(180 * scale), int(220 * scale), 
                      int(260 * scale), int(300 * scale), int(340 * scale), 
                      int(380 * scale), int(420 * scale)]
    
    for y_pos in dot_y_positions:
        draw.ellipse([center - dot_radius, y_pos - dot_radius, 
                     center + dot_radius, y_pos + dot_radius], 
                     fill=(108, 117, 125, 255))
    
    # Optional: Subtle connecting lines to emphasize synchronization
    if size >= 32:  # Only add connecting lines for larger icons
        for i, y_pos in enumerate(dot_y_positions[:-1]):
            next_y = dot_y_positions[i + 1]
            draw.line([center, y_pos, center, next_y], 
                     fill=(0, 123, 255, 100), width=max(1, int(2 * scale)))
    
    return img

def main():
    """Generate all required icon sizes."""
    # Create icons directory if it doesn't exist
    os.makedirs('icons', exist_ok=True)
    
    # Required sizes for Chrome extension
    sizes = [16, 32, 48, 64, 128, 256, 512, 1024]
    
    print("Generating synchronization icons with irregular color pattern...")
    
    for size in sizes:
        print(f"Creating {size}x{size} icon...")
        icon = create_sync_icon(size)
        icon.save(f'icons/icon_{size}.png', 'PNG')
    
    print("All icons generated successfully!")
    print("Generated files:")
    for size in sizes:
        print(f"  - icons/icon_{size}.png")

if __name__ == "__main__":
    main()

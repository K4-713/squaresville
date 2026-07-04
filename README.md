# Squaresville Pattern Generator
A tool to create patterns for quilting, cross-stitch, mosaics, or other physical objects from a digital image

Try the Squaresville Pattern Generator at squaresville.k4-713.com

## How to use Squaresville
First, upload an image to start with. 
You will be prompted what kind of item you would like to generate a pattern for, what measurement units you'd like to work with, how large you want your squares to be in real life, how many rows/columns of squares you want in the pattern (with the image's original dimensions in pixels as the default), and maximum number of colors to use.

With this information, Squaresville will generate and display a base pattern image to work with, side-by-side with the original upload. It will also display the final dimensions of the piece based on your parameters, how many total squares are in the pattern, and open an editable color palette with all the colors present in the pattern image for fine-tuning.

## Fine-tuning your Squaresville pattern
Squaresville allows a large degree of control over your pattern, and makes it simple to adjust things like square size, row/column (pixel) count, number of distinct colors in the palette, and more. For ease of use, you will be able to undo up to 10 recent actions against the palette, project dimensions, and image conversion style (dithering, diffusion, nearest color). Additionally, a zoom factor can be applied to the pattern image throughout the editing process, so it's easier to see and manipulate.

### Adjust Number of Colors
If you want to let Squaresville automatically adjust the number of colors in your final image, adjust the target number of colors in the palette (Either use the text control, or the associated up/down buttons). The pattern image will automatically regenerate, according to your selected conversion style.

### Adjust Individual Palette Colors
Each individual color in the palette can be removed, changed to a different color, or merged with another color in the palette. Start by seleting the color you want to alter: This will add that color's information to the color detail pane. The detail pane shows:
* Information about the color, including a swatch and hex code
* How many squares of that color are in the current pattern
* The selected color's nearest neighbor colors in the current palette, and how many squares each of these has in the current pattern
* A color adjuster tool to edit the color either by color picker, color sliders (rgb, cmyk), or directly via hex code

Additionally, when selecting a color, all that color's pixels in the pattern preview image will slowly pulse once.

For convenience, the current color palette can be sorted in a variety of standard color sort methods, and also by frequency of that color in the current pattern image. When a color is selected, it will remain selected through a sorting operation.

#### Deleting a Color
Select the color you want to remove, and click on that color's delete button in the detail pane. The image will regenerate, reassigning that color's pixels to the nearest remaining color in the palette.

#### Merging Colors
Select the color you want to merge with another color in the palette. In the detail pane, make sure the style of merge you want to perform is selected, click the "Merge Color" button, and then select the color you want to merge with. You can select any of the current colors in the palette to merge with, or select one of the convenient near neighbor colors in the detail pane.
Merge styles are:
* A->B : Assigns all the first selected color's pixels to the second color, and removes the first color
* A<-B : Assigns all the second color's pixels to the first color, and removes the second color
* Average Color: Assigns both color's pixels to the average of both colors, removes both original colors, and adds the average color to the palette

## Saving the Pattern Image
At any point, right-clicking and saving the pattern image will work: The indexed color image will remain saveable, making it easy to resume progress by re-uploading the pattern image.

## Saving The Final Pattern
When you are happy with the result, click the large "Generate Pattern" button under the pattern preview image. You will be prompted for your desired size of row/column groups (3 or 5), and symbol type (numeric or true symbols). Squaresville will then assign one symbol to each color in the palette, and generate both the pattern and color legend in a tabbed spreadsheet.

The pattern spreadsheet will directly correspond to the pattern preview image, with each pixel row and column corresponding to a spreadsheet row / column. The rows and columns will be grouped by the selected size of row/column groups, with subtle alternating background colors to make it easier to follow in a large project.

The color legend sheet will include the color's symbol, a swatch of the color with its hex code, and the number of squares using this color in the final pattern.

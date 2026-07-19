# Core

## Project Structure
- Shopify Liquid theme for "Shelf Indulgence" - bookish vendor in Australia
- Templates in `templates/` (JSON for pages, Liquid for some)
- Sections in `sections/` (Liquid with schema)
- Assets in `assets/` (images, CSS)
- Uses Prettier with `@shopify/prettier-plugin-liquid`

## Key Pages
- `/pages/events` - Events listing with dates and images
- Event gallery: `si-event-gallery.liquid` for individual event details
- Events list: `si-events.liquid` for sidebar navigation

## Code Style
- Liquid sections with `{% schema %}` blocks
- CSS variables for theming (`--si-cream`, `--si-burg`, etc.)
- Responsive design with media queries
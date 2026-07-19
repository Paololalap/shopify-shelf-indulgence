# Conventions

## Code Style
- Liquid sections use `{% schema %}` for settings
- CSS uses custom properties (variables) for theming
- Responsive design with `@media screen and (max-width: 768px)`
- Images use `loading='lazy'` attribute
- Alt text required for accessibility

## File Naming
- Sections: `si-*.liquid` for custom sections
- Templates: `page.*.json` for page templates
- Assets: kebab-case for images

## Patterns
- Event pages use `si-event-upcoming.liquid` for listing
- Gallery pages use `si-event-gallery.liquid` for details
- Events have date, name, and link properties
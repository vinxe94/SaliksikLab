# Tukiva visual design

The supplied login reference guides the emerald-and-white palette, lime accents, curved split-screen layout, campus backdrop, rounded sign-in card, and research-community messaging. The existing Tukiva logo is retained. The same palette is applied to the shared navigation, buttons, dashboard, repository, and management header.

Account-entry screens share `frontend/src/components/AuthLayout.jsx` and `frontend/src/styles/auth.css`. Authentication calls, account roles, database settings, document storage, and hosting behavior are unchanged. The mobile layout prioritizes the form and hides the decorative desktop story panel.

## Dashboard reference

The dashboard uses a curved campus banner, five live metric cards, a two-entry recent research list, a help illustration, and dashboard-scoped sidebar styling. The header search opens the repository with its search term; the activity button retains the recent outputs and displays the administrator's pending-output count. Profile and sign-out controls use the existing account context. Percentage trends are not shown because the current statistics endpoint does not provide historical comparisons. No database or authentication changes are required.

The dashboard layout is implemented in `frontend/src/pages/DashboardPage.jsx`, `frontend/src/components/DashboardHeader.jsx`, and the scoped `frontend/src/styles/dashboard.css`. The existing campus image is reused; the books-and-magnifier illustration is code-native SVG.

## Campus artwork provenance

- Project asset: `frontend/public/images/research-campus.png`.
- Method: built-in image generation tool, not the API/CLI fallback.
- Purpose: decorative, fictional campus architecture; it is not a photograph of the user's institution.
- Existing logo assets are reused without modification.

Generation prompt:

> Use case: photorealistic-natural. Asset type: decorative university-campus background photo for the left green panel of the Tukiva research repository login page. Create a photorealistic architectural photograph of a modern three-storey university research building in a lush tropical campus, light ivory concrete frame, tall glass windows, covered walkways, neatly trimmed grass and one mature leafy tree at the right. Landscape 3:2 composition, architecture concentrated in the lower half and right side, generous calm sky and soft greenery in the upper left for a dark-green CSS text overlay. Eye-level three-quarter view, softly overcast daylight, sophisticated natural deep emerald greens and warm stone. Realistic photography, not an illustration. No people in foreground, no signs, no writing, no logos, no UI, no border, no watermark. This is only the campus photo, not a screenshot or a complete page.

# MOBILE_GAME_DEV_RULES.md

You are assisting with mobile game and app development.

Primary Platform:
Android phones

Build Pipeline:
GitHub + EAS Build + OTA Updates

Development Philosophy:
- Mobile-first design
- Fast iteration
- Performance over graphical complexity
- Gameplay feel over realism
- Clean scalable systems
- Minimal unnecessary rewrites

General Rules:
- Full file replacements only unless otherwise requested
- Do not refactor unrelated systems
- Preserve existing architecture whenever possible
- Explain risks before major changes
- Avoid feature creep
- Prioritize maintainability and readability
- Keep systems modular and scalable
- Avoid unnecessary dependencies
- Respect existing folder structure
- Never rename files or systems without approval

Touchscreen Philosophy:
- Touchscreen controls are primary
- Bluetooth controller support is secondary
- UI must remain readable during gameplay
- Avoid precision-heavy gameplay requirements
- Large touch zones are preferred

Performance Philosophy:
- Maintain strong performance on midrange Android devices
- Reduce unnecessary draw calls
- Avoid excessive particles or transparency
- Keep update loops lightweight
- Use pooling systems when appropriate
- Avoid memory-heavy solutions unless required

Asset Philosophy:
- Low poly visuals are acceptable and preferred
- Gameplay readability is more important than realism
- Kenney assets are acceptable and encouraged
- Prefer GLB asset format when possible

Troubleshooting Rules:
- Identify root cause before proposing solutions
- Explain likely regression risks
- Keep fixes as isolated as possible
- Avoid rewriting entire systems for isolated bugs
- Preserve working functionality
- Verify mobile compatibility after fixes

Build and Deployment Rules:
- OTA updates are preferred whenever possible
- APK builds should only be triggered when absolutely necessary
- Never trigger both OTA and APK builds at the same time
- After every implementation explanation, clearly state:
  - OTA REQUIRED
  - APK REQUIRED
  - NO BUILD REQUIRED

APK REQUIRED Conditions:
- Native dependency changes
- Expo plugin changes
- Android permission changes
- SDK version changes
- Package installation/removal
- Build configuration changes
- Anything requiring native recompilation

OTA Preferred Conditions:
- UI updates
- Gameplay logic updates
- Balancing
- JavaScript/TypeScript changes
- Asset updates
- Non-native bug fixes

Response Format Requirements:
After all implementation explanations include one of the following:

BUILD STATUS:
- OTA REQUIRED

or

BUILD STATUS:
- APK REQUIRED

or

BUILD STATUS:
- NO BUILD REQUIRED

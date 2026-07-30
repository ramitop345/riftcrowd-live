# RiftCrowd LIVE — IP and Platform Checklist (DRAFT)

> **DRAFT. Not legal advice.** This checklist is an engineering guardrail derived from Section 8 of
> `RiftCrowd_LIVE_Complete_Qoder_Implementation_Guide.md`. Obtain professional legal and trademark
> advice before any commercial release or public branding.

Every asset, name, and mechanic that ships must clear this list. Anything unchecked blocks release.

## Club, team, and supporter identity

- [ ] No official football or sports **club names** in shipped data.
- [ ] No official **nicknames** (a nickname can itself be a protected brand identifier).
- [ ] No club **crests, badges, or logos**.
- [ ] No **jersey/kit designs**, shirt layouts, sponsor placements, or recognisable colour-and-stripe
      combinations copied from a real club.
- [ ] No real **player names, likenesses, numbers, signatures, or celebrations**.
- [ ] No club **songs, chants, or slogans**.
- [ ] No names that are deliberate **misspellings or near-misses** of famous clubs.
- [ ] The `fan_crews_original` mode ships **entirely fictional** crews. Confirmed by content review.
- [ ] Any future licensed pack loads through the same content-pack format **only after written
      permission** is on file.

## Country, city, and government symbols

- [ ] Country names used **descriptively only**; no implication of government endorsement.
- [ ] No government **seals, coats of arms, or military insignia**.
- [ ] Flags and official emblems are **not hardcoded** into the core game; any use is optional,
      reviewed, and jurisdiction-checked.
- [ ] City names used descriptively; no **municipal logos, city seals, transport logos**, or city
      sports branding.
- [ ] Skylines and landmarks are **original silhouettes**, not copied artwork or logo-like renderings.

## Artwork, audio, and assets

- [ ] No **copyrighted music**. Soundtrack and effects are original or under a licence that permits
      commercial livestreaming, with the licence recorded.
- [ ] No **copied, traced, or AI-laundered artwork** from third-party games, films, or franchises.
- [ ] All placeholder visuals are **original SVGs authored for this project**, and are labelled as
      placeholders in the repository.
- [ ] No third-party fonts without a licence that permits embedding and streaming.
- [ ] Animal characters use original art, animation, sound, and names.
- [ ] No viewer **profile images** are downloaded or stored (avatars are disabled in the MVP).
- [ ] Contributor assignments and asset licences are archived as evidence.

## Platform conduct and monetisation

- [ ] No **gambling or gambling-like** mechanics: no lottery tickets, no wagers, no prize draws.
- [ ] No **cash, product, or monetary prizes**; no winner-takes-money pools.
- [ ] No **hidden odds**. A viewer always receives the visible effect the gift mapping describes.
- [ ] No **pressure-based gifting**: no fake countdowns, no claims that spending is required to avoid
      a penalty, no promise that a gift returns real-world value.
- [ ] Every call to action is framed as **optional participation**.
- [ ] **Free participation methods are displayed prominently** and are mechanically meaningful.
- [ ] Gifts never guarantee a match victory.
- [ ] Compliance re-verified against TikTok's **current** LIVE, monetisation, virtual-item, and gaming
      rules before each public release.

## Naming and trademark

- [ ] `RiftCrowd LIVE` is an **internal working title only**. It has **not** been trademark-cleared.
- [ ] Before public branding: search the web, app stores, game stores, social platforms, domain
      registries, EUIPO, and WIPO.
- [ ] Check **confusingly similar** names, not only exact matches.
- [ ] Obtain professional trademark advice before a major launch.
- [ ] Keep evidence of all searches, licences, and contributor assignments.

## Data and privacy

- [ ] No viewer personal data beyond the in-session handle and display name.
- [ ] No persistence of raw provider payloads; only `rawHash` is retained for dedupe.
- [ ] No credentials, cookies, tokens, or API keys in logs, commits, or crash reports.

## Review log

| Date | Reviewer | Scope | Outcome |
| ---- | -------- | ----- | ------- |
|      |          |       |         |

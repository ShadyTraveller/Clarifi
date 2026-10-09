-- Yavamo supplier_materials seed — INTERNAL COST BASIS ONLY (never client-visible).
-- Generated 2026-10-08 from observed public CAD prices
-- (Home Depot Canada, Canadian Tire, Amazon CA, Walmart CA).
-- Idempotent: re-runs converge via the unique index + ON CONFLICT DO NOTHING.

create unique index if not exists supplier_materials_org_retailer_sku_uidx
  on public.supplier_materials (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, ''));

do $$
declare
  org uuid;
begin
  for org in select id from public.organizations loop

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'doors', 'Masonite 30-inch x 80-inch Primed 2-Panel Hollow Core Smooth Interior Door Slab', 'Masonite', 8800, 'CAD', 'Home Depot Canada', 'https://www.homedepot.ca/product/masonite-30-inch-x-80-inch-primed-2-panel-hollow-core-smooth-interior-door-slab/1000485123', '1000485123', 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'doors', 'Masonite 30-inch x 80-inch Primed 6-Panel Hollow Core Textured Interior Door Pre-bored Slab', 'Masonite', 9700, 'CAD', 'Home Depot Canada', 'https://www.homedepot.ca/product/masonite-30-inch-x-80-inch-primed-6-panel-hollow-core-textured-interior-door-pre-bored-slab/1000711037', '1000711037', 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'doors', 'Masonite 30-inch x 80-inch Primed 6-Panel Solid Core Textured Interior Door Slab', 'Masonite', 17600, 'CAD', 'Home Depot Canada', 'https://www.homedepot.ca/product/masonite-30-inch-x-80-inch-primed-6-panel-hollow-core-textured-interior-door-pre-bored-slab/1000711037', '1000174915', 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'doors', 'Masonite 30-inch x 80-inch x 4-9/16-inch 6-Panel Hollow Core Single Prehung Interior Door RH (NH)', 'Masonite', 19800, 'CAD', 'Home Depot Canada', 'https://www.homedepot.ca/product/masonite-30-inch-x-80-inch-x-4-9-16-inch-6-panel-hollow-core-single-prehung-interior-door-rh/1000135008', '1000135008', 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'doors', 'Onward (2-Pack) 3-1/2-inch Full Mortise Ball Bearing Butt Hinge for Interior Door, Square Corner, Black', 'Onward', 1996, 'CAD', 'Home Depot Canada', 'https://www.homedepot.ca/product/onward--2-pack-3-1-2-inch-89-mm-full-mortise-ball-bearing-butt-hinge-for-interior-door-square-corner-black-finish/1001266298', '4821FBB', 'pack', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'doors', 'M-D Building Products 36-inch Premium Aluminum & Rubber Commercial Under Door Sweep, Grey', 'M-D Building Products', 2078, 'CAD', 'Home Depot Canada', 'https://www.homedepot.ca/product/m-d-building-products-36-inch-premium-aluminum-rubber-commerical-under-door-sweep-grey/1001122639', 'WS31194', 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'doors', 'M-D Building Products 36-inch Vinyl U-Shaped Under Door Bottom Weather Strip, Brown', 'M-D Building Products', 2198, 'CAD', 'Home Depot Canada', 'https://www.homedepot.ca/product/m-d-building-products-36-inch-vinyl-u-shaped-under-door-bottom-weather-strip-brown/1001120732', '1001120732', 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'doors', 'M-D Building Products Top & Side Door Weather Stripping Seal Set, Bronze (2x84-in + 1x36-in)', 'M-D Building Products', 4987, 'CAD', 'Home Depot Canada', 'https://www.homedepot.ca/product/m-d-building-products-2-x-84-inch-1-x-36-inch-aluminium-vinyl-clad-top-side-weather-stripping-seal-set-bronze/1001122111', 'WS31171', 'kit', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'doors', 'Frost King Aluminum Interior Threshold, 1-3/4-in x 36-in, Silver', 'Frost King', 1599, 'CAD', 'Canadian Tire', 'https://www.canadiantire.ca/en/pdp/frost-king-aluminum-interior-threshold-1-3-4-in-x-36-in-silver-0640923p.html', 'ST175C', 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'doors', 'Frost King Aluminum Heavy-Duty Bumper Threshold, 1-1-4-in x 36-in, White', 'Frost King', 1999, 'CAD', 'Canadian Tire', 'https://www.canadiantire.ca/en/pdp/frost-king-aluminum-heavy-duty-bumper-threshold-1-1-4-x-36-white-0640930p.html', 'BT34SC', 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'doors', '4-Pack 3.5-inch Satin Brass Door Hinges, No-Squeak, 5/8-in Radius', NULL, 2999, 'CAD', 'Amazon Canada', 'https://www.amazon.ca/dp/B0FK2QKK56', NULL, 'pack', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'security-film', 'Gila XTREME LIMO BLACK Window Tint, Maximum Privacy, 2.5% VLT (6.5'' x 24" roll)', 'Gila', 3599, 'CAD', 'Canadian Tire', 'https://www.canadiantire.ca/en/pdp/gila-scratch-resistant-xtreme-limo-window-tint-midnight-black-0411947p.html', '0411947P', 'roll', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'security-film', 'Gila HEAT SHIELD Automotive Window Tint, Scratch-Resistant, 5% VLT (6.5'' x 24" roll)', 'Gila', 2899, 'CAD', 'Canadian Tire', 'https://www.canadiantire.ca/en/pdp/gila-basic-heat-shield-automotive-window-tint-0411937p.0411937.html?rq=adhesive+tint', 'NRS42', 'roll', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'security-film', 'Gila Window Film Application Solution, 473-mL', 'Gila', 1699, 'CAD', 'Canadian Tire', 'https://www.canadiantire.ca/en/pdp/gila-window-film-application-solution-473-ml-0419328p.html', 'FS200C', 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'security-film', 'Type S Decorative Wrap Film Deluxe Installation Kit (4 custom tools + felt-edge squeegee)', 'Type S', 1499, 'CAD', 'Canadian Tire', 'http://www.canadiantire.ca/en/pdp/decorative-wrap-film-deluxe-installation-kit-1410574p.html', 'AC31476F60/6', 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'security-film', 'Coavas Reflective One Way Window Film, Silver Black (17.5 x 78.7 in / 44.5 x 200 cm)', 'Coavas', 1019, 'CAD', 'Amazon Canada', 'https://www.amazon.ca/dp/B0CP3LH63L/ref=cm_sw_r_cso_fb_apan_dp_Z9K15716M6Q99FKBEBRB', 'B0CP3LH63L', 'roll', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'security-film', 'One Way Window Privacy Film, PET Explosion-Proof, Silver (29.5" x 157.5")', 'LULUETPUE', 4399, 'CAD', 'Amazon Canada', 'https://www.amazon.ca/dp/B0BQW6WJC9/ref=cm_sw_r_cso_fm_mwn_dp_RC64EZ8CAYC85GYHG2PR', 'B0BQW6WJC9', 'roll', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'security-film', 'One Way Window Privacy Film, Reflective Sun Heat Blocking, Silver Black (23.6" x 78.7")', 'LULUETPUE', 2674, 'CAD', 'Amazon Canada', 'https://www.amazon.ca/dp/B0DSB2YYSX/ref=cm_sw_r_cso_cp_apin_dp_XP2WB4344Y4XV31S5GEF', 'B0DSB2YYSX', 'roll', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'security-film', 'Dvkptbk Reflective Window Film, Heat Control Self-Adhesive (30 x 200 cm / 11.81 x 78.74 in)', 'Dvkptbk', 1240, 'CAD', 'Walmart Canada', 'https://www.walmart.ca/en/ip/Dvkptbk-Window-Privacys-Film-Reflective-Window-Film-Heat-Control-Window-Tint-Self-Adhesive-Daytime-Window-Tint-Film-for-Home-And-Office/60BL5DGDPIW0', '60BL5DGDPIW0', 'roll', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'security-film', 'EHDIS 7-Piece Window Tint Tool Kit (squeegees, felt scraper, film cutter + 10 snap-off blades)', 'EHDIS', 1899, 'CAD', 'Amazon Canada', 'https://www.amazon.ca/dp/B01J3QVS2K/ref=cm_sw_r_cso_fm_mwn_dp_XP2WB4344Y4XV31S5GEF', 'B01J3QVS2K', 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'locksmith', 'Schlage Satin Nickel Single Cylinder Exterior Door Deadbolt, Rated AAA', 'Schlage', 5998, 'CAD', 'Home Depot Canada', 'https://www.homedepot.ca/product/schlage-nickel-single-cylinder-exterior-door-deadbolt-with-rated-aaa/1000430656', '1000430656', 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'locksmith', 'Baldwin Prestige Polished Brass Double Cylinder Round Deadbolt', 'Baldwin', 6240, 'CAD', 'Home Depot Canada', 'https://www.homedepot.ca/product/baldwin-prestige-polished-brass-double-cylinder-round-deadbolt/1000792397', '1000792397', 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'locksmith', 'Schlage Antique Brass Deadbolt and Georgian Keyed Exterior Door Knob Combo, Rated AAA', 'Schlage', 6549, 'CAD', 'Home Depot Canada', 'https://www.homedepot.ca/product/schlage-antique-brass-deadbolt-and-georgian-keyed-exterior-door-knob-entry-door-lock-knob-combo-rated-aaa/1000766755', '1000766755', 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'locksmith', 'Weiser Trafford Satin Nickel Exterior Door Handle / Keyed Entry Door Lever', 'Weiser', 7498, 'CAD', 'Home Depot Canada', 'https://www.homedepot.ca/product/weiser-trafford-satin-nickel-exterior-door-handleentry-door-lock-with-key/1001864852', '1001864852', 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'locksmith', 'Weiser SmartKey Re-Key Kit - DIY Lock Rekeying Set with 6 Keys & Rekey Tool', 'Weiser', 2198, 'CAD', 'Home Depot Canada', 'https://www.homedepot.ca/product/weiser-smartkey-re-key-kit/1000465150', '1000465150', 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'locksmith', 'Prime-Line Stainless Steel Lock and Door Reinforcement Plate for 1-3/4 In. Thick Doors (Single Pack)', 'Prime-Line', 2236, 'CAD', 'Home Depot Canada', 'https://www.homedepot.ca/product/prime-line-stainless-steel-lock-and-door-reinforcement-plate-for-1-3-4-in-thick-doors-stainless-steel-finish-single-pack-/1001025875', '1001025875', 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'locksmith', 'Schlage Single-Cylinder Round Deadbolt Door Lock, Satin Chrome', 'Schlage', 5999, 'CAD', 'Canadian Tire', 'https://www.canadiantire.ca/en/pdp/schlage-deadbolt-aaa-rated-highest-residential-security-satin-chrome-0462757p.html', '0462757P', 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'locksmith', 'Schlage Single-Cylinder Round Deadbolt Door Lock, Matte Black', 'Schlage', 5999, 'CAD', 'Canadian Tire', 'https://www.canadiantire.ca/en/pdp/schlage-deadbolt-aaa-rated-highest-residential-security-matte-black-0467434p.html', '0467434p', 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'locksmith', 'Weiser Elements Square Single-Cylinder Deadbolt with SmartKey, Matte Black', 'Weiser', 4499, 'CAD', 'Canadian Tire', 'https://www.canadiantire.ca/en/pdp/weiser-elements-square-deadbolt-front-door-lock-featuring-smartkey-matte-black-0463446p.html', '0463446P', 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'locksmith', 'Schlage Plymouth Light Commercial Keyed Entry Door Knob, Satin Chrome', 'Schlage', 6499, 'CAD', 'Canadian Tire', 'https://www.canadiantire.ca/en/pdp/schlage-plymouth-light-commercial-keyed-entry-door-knob-lifetime-warranty-satin-chrome-0467904p.html', '93983', 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'locksmith', 'Weiser SmartKey Re-Key Kit - DIY Lock Rekeying Set with 6 Keys & Rekey Tool', 'Weiser', 2198, 'CAD', 'Amazon Canada', 'https://www.amazon.ca/dp/B00E5YO31Y/ref=cm_sw_r_cso_cp_apin_dp_P0FY8XPT61F0PS72H9Q0', 'B00E5YO31Y', 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'skincare', 'Shark CryoGlow Red Blue & Infrared iQLED Face Mask & Under Eye Cooling', 'Shark', 49999, 'CAD', 'Canadian Tire', 'https://www.canadiantire.ca/en/pdp/shark-cryoglow-temperature-controlled-led-face-mask-4994325p.html', 'FW312C', 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'skincare', 'Conair True Glow Wireless LED Light Therapy Face Mask', 'Conair', 19999, 'CAD', 'Canadian Tire', 'https://www.canadiantire.ca/en/pdp/true-glow-wireless-led-light-therapy-face-mask-4994228p.4994228.html', 'MASK4LC', 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'skincare', 'Plum Beauty LED Radiance Wand', 'Plum Beauty', 3497, 'CAD', 'Walmart Canada', 'https://www.walmart.ca/en/ip/Plum-Beauty-LED-Radiance-Wand-Awaken-your-Glow-Radiant-Skin-ageless-you-Target-Skin-Concerns/6000208929101', NULL, 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'skincare', 'Red Light Therapy Panel Lamp with Stand, 660nm Deep Red + 850nm Near Infrared, 150 LEDs', 'Venoya', 11096, 'CAD', 'Amazon Canada', 'https://www.amazon.ca/dp/B0D86HCGK8/ref=cm_sw_r_cso_cp_apin_dp_MVPQ575AXNVWE1VB7G87', 'B0D86HCGK8', 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'skincare', 'BONTANNY BO-300 Red Light Panel, 660nm/850nm, 60 Dual-Chip LEDs, Remote + Timer + Stand', 'BONTANNY', 19999, 'CAD', 'Amazon Canada', 'https://www.amazon.ca/dp/B0CRYQV244/ref=cm_sw_r_cso_fm_apin_dp_MR1CH66DQ98CGVEFJJTF', 'BO-300', 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

    insert into public.supplier_materials
      (organization_id, service, name, brand, public_price_cents, currency, retailer, source_url, sku, unit, notes)
    values (org, 'skincare', 'Handheld Red Light Therapy Device for Pain Relief, 12x650nm + 2x808nm diodes', 'YJT', 11698, 'CAD', 'Amazon Canada', 'https://www.amazon.ca/dp/B08P4FHQ2G/ref=cm_sw_r_fa_ud_dp_XXJ0S9DS1BEDVD1KJ2NJ', 'B08P4FHQ2G', 'each', NULL)
    on conflict (organization_id, retailer, coalesce(sku, ''), coalesce(source_url, '')) do nothing;

  end loop;
end $$;

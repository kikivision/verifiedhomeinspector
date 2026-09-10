-- Seed data: real, DBPR-verified Pinellas County home inspectors,
-- cross-checked against public license-lookup sources during the design
-- phase. This is a SAMPLE (11 records), not the full ~432-inspector pull —
-- that's the job of the real DBPR scraper, not this seed file.
--
-- Every record here is genuinely licensed; none of these businesses have
-- actually paid for or agreed to claimed/featured status, so everything
-- is correctly seeded as 'unclaimed' — matching real-world status, not
-- a sales demo. Do not mark real, non-paying businesses as 'featured' or
-- 'claimed' just to make the site look more populated.

insert into listings (county, city, license_number, licensee_name, business_name, phone, tier)
values
  ('pinellas', 'Largo', 'HI3532', 'Chad Robert Dempster', 'Inspect Florida LLC', '(727) 222-5955', 'unclaimed'),
  ('pinellas', 'Largo', 'HI15142', 'Alex Moran', 'Florida Building Inspection Group', '(813) 398-1874', 'unclaimed'),
  ('pinellas', 'Dunedin', 'HI10580', 'Samuel Bruce Peavler', 'National Property Inspections', null, 'unclaimed'),
  ('pinellas', 'St. Petersburg', 'HI1631', 'Basil James Arend', null, null, 'unclaimed'),
  ('pinellas', 'Clearwater', 'HI405', 'Kevin P Dowd', null, null, 'unclaimed'),
  ('pinellas', 'Largo', 'HI1816', 'Ted C Wieder', null, null, 'unclaimed'),
  ('pinellas', 'Dunedin', 'HI13566', 'Steven Wasilefsky', null, null, 'unclaimed'),
  ('pinellas', 'Seminole', 'HI5519', 'Shane T Wheeler', null, null, 'unclaimed'),
  ('pinellas', 'Safety Harbor', 'HI16725', 'Jonathan Steele', null, null, 'unclaimed'),
  ('pinellas', 'Gulfport', 'HI15804', 'Eric Thomas Wilcox', null, null, 'unclaimed'),
  ('pinellas', 'Pinellas Park', 'HI16329', 'Eddie G Corsino', '911 Home Inspection LLC', '(727) 310-1238', 'unclaimed')
on conflict (license_number) do nothing;

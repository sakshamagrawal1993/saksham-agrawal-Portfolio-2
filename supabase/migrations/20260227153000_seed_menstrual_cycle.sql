-- Menstrual cycle tracking data for Saksham Test Twin (28-day cycle simulation)
-- Cycle starts ~14 days ago, so we simulate: menstruation days 1-5, follicular 6-13, ovulation 14, luteal 15-28

-- Day 1-5: Menstruation phase
INSERT INTO public.health_wearable_parameters (twin_id, parameter_name, parameter_value, unit, recorded_at, category, parameter_text) VALUES
('4ef63a52-f0e0-4091-82e9-94303070b252', 'Menstrual Cycle Phase', 0, '', '2026-02-13T08:00:00Z', 'reproductive', 'Menstruation'),
('4ef63a52-f0e0-4091-82e9-94303070b252', 'Menstrual Flow Intensity', 3, 'level', '2026-02-13T08:00:00Z', 'reproductive', 'Heavy'),
('4ef63a52-f0e0-4091-82e9-94303070b252', 'Menstrual Cycle Day', 1, 'day', '2026-02-13T08:00:00Z', 'reproductive', NULL),

('4ef63a52-f0e0-4091-82e9-94303070b252', 'Menstrual Cycle Phase', 0, '', '2026-02-14T08:00:00Z', 'reproductive', 'Menstruation'),
('4ef63a52-f0e0-4091-82e9-94303070b252', 'Menstrual Flow Intensity', 3, 'level', '2026-02-14T08:00:00Z', 'reproductive', 'Heavy'),
('4ef63a52-f0e0-4091-82e9-94303070b252', 'Menstrual Cycle Day', 2, 'day', '2026-02-14T08:00:00Z', 'reproductive', NULL),

('4ef63a52-f0e0-4091-82e9-94303070b252', 'Menstrual Cycle Phase', 0, '', '2026-02-15T08:00:00Z', 'reproductive', 'Menstruation'),
('4ef63a52-f0e0-4091-82e9-94303070b252', 'Menstrual Flow Intensity', 2, 'level', '2026-02-15T08:00:00Z', 'reproductive', 'Medium'),
('4ef63a52-f0e0-4091-82e9-94303070b252', 'Menstrual Cycle Day', 3, 'day', '2026-02-15T08:00:00Z', 'reproductive', NULL),

('4ef63a52-f0e0-4091-82e9-94303070b252', 'Menstrual Cycle Phase', 0, '', '2026-02-16T08:00:00Z', 'reproductive', 'Menstruation'),
('4ef63a52-f0e0-4091-82e9-94303070b252', 'Menstrual Flow Intensity', 1, 'level', '2026-02-16T08:00:00Z', 'reproductive', 'Light'),
('4ef63a52-f0e0-4091-82e9-94303070b252', 'Menstrual Cycle Day', 4, 'day', '2026-02-16T08:00:00Z', 'reproductive', NULL),

('4ef63a52-f0e0-4091-82e9-94303070b252', 'Menstrual Cycle Phase', 0, '', '2026-02-17T08:00:00Z', 'reproductive', 'Menstruation'),
('4ef63a52-f0e0-4091-82e9-94303070b252', 'Menstrual Flow Intensity', 1, 'level', '2026-02-17T08:00:00Z', 'reproductive', 'Light'),
('4ef63a52-f0e0-4091-82e9-94303070b252', 'Menstrual Cycle Day', 5, 'day', '2026-02-17T08:00:00Z', 'reproductive', NULL),

-- Day 6-13: Follicular phase
('4ef63a52-f0e0-4091-82e9-94303070b252', 'Menstrual Cycle Phase', 0, '', '2026-02-18T08:00:00Z', 'reproductive', 'Follicular'),
('4ef63a52-f0e0-4091-82e9-94303070b252', 'Menstrual Cycle Day', 6, 'day', '2026-02-18T08:00:00Z', 'reproductive', NULL),
('4ef63a52-f0e0-4091-82e9-94303070b252', 'Menstrual Cycle Phase', 0, '', '2026-02-20T08:00:00Z', 'reproductive', 'Follicular'),
('4ef63a52-f0e0-4091-82e9-94303070b252', 'Menstrual Cycle Day', 8, 'day', '2026-02-20T08:00:00Z', 'reproductive', NULL),
('4ef63a52-f0e0-4091-82e9-94303070b252', 'Menstrual Cycle Phase', 0, '', '2026-02-22T08:00:00Z', 'reproductive', 'Follicular'),
('4ef63a52-f0e0-4091-82e9-94303070b252', 'Menstrual Cycle Day', 10, 'day', '2026-02-22T08:00:00Z', 'reproductive', NULL),
('4ef63a52-f0e0-4091-82e9-94303070b252', 'Menstrual Cycle Phase', 0, '', '2026-02-25T08:00:00Z', 'reproductive', 'Follicular'),
('4ef63a52-f0e0-4091-82e9-94303070b252', 'Menstrual Cycle Day', 13, 'day', '2026-02-25T08:00:00Z', 'reproductive', NULL),

-- Day 14: Ovulation
('4ef63a52-f0e0-4091-82e9-94303070b252', 'Menstrual Cycle Phase', 0, '', '2026-02-26T08:00:00Z', 'reproductive', 'Ovulation'),
('4ef63a52-f0e0-4091-82e9-94303070b252', 'Menstrual Cycle Day', 14, 'day', '2026-02-26T08:00:00Z', 'reproductive', NULL),
('4ef63a52-f0e0-4091-82e9-94303070b252', 'Ovulation Detected', 1, 'boolean', '2026-02-26T08:00:00Z', 'reproductive', NULL),

-- Day 15+: Luteal phase
('4ef63a52-f0e0-4091-82e9-94303070b252', 'Menstrual Cycle Phase', 0, '', '2026-02-27T08:00:00Z', 'reproductive', 'Luteal'),
('4ef63a52-f0e0-4091-82e9-94303070b252', 'Menstrual Cycle Day', 15, 'day', '2026-02-27T08:00:00Z', 'reproductive', NULL);

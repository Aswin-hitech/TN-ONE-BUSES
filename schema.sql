-- =======================================================
-- TN-ONE SIMPLIFIED DATABASE SCHEMA (2 Tables)
-- Easy to add, inspect, and manage manually via SQL
-- =======================================================

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone_number VARCHAR(32),
    username VARCHAR(80) UNIQUE,
    password_hash VARCHAR(255),
    google_id VARCHAR(64) UNIQUE,
    profile_picture VARCHAR(1024),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);


-- 2. BUSES TABLE
-- Stores:
--   - bus name
--   - bus timings (comma-separated, e.g. '06:20, 08:30, 14:15')
--   - start & destination stops
--   - boarded stops (comma-separated intermediate stops)
--   - bus type: Government, Private, Deluxe, Fast
--   - reaching time (predicted automatically or manually specified)
--   - bus fare
--   - distance (in km)
CREATE TABLE IF NOT EXISTS buses (
    id SERIAL PRIMARY KEY,
    bus_name VARCHAR(255) NOT NULL,
    bus_number VARCHAR(64),
    bus_type VARCHAR(64) NOT NULL DEFAULT 'Government',
    operator VARCHAR(255),
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    start_stop VARCHAR(255) NOT NULL,
    destination_stop VARCHAR(255) NOT NULL,
    boarded_stops TEXT,
    bus_timings TEXT,
    bus_fare DOUBLE PRECISION DEFAULT 20.0,
    distance_km DOUBLE PRECISION,
    reaching_time VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_buses_user_id ON buses(user_id);
CREATE INDEX IF NOT EXISTS idx_buses_start ON buses(start_stop);
CREATE INDEX IF NOT EXISTS idx_buses_destination ON buses(destination_stop);
CREATE INDEX IF NOT EXISTS idx_buses_type ON buses(bus_type);
CREATE INDEX IF NOT EXISTS idx_buses_name ON buses(bus_name);

-- =======================================================
-- SAMPLE SQL INSERTS (Copy & run to insert buses manually)
-- =======================================================

-- Example 1: Government Regular Bus
INSERT INTO buses (bus_name, bus_number, bus_type, operator, start_stop, destination_stop, boarded_stops, bus_timings, bus_fare, distance_km, reaching_time)
VALUES (
    '12A',
    '12A',
    'Government',
    'TNSTC',
    'Gandhipuram',
    'Ukkadam',
    'Gandhipuram, Lakshmi Mills, Ramanathapuram, Sungam, Ukkadam',
    '06:20, 07:15, 08:30, 10:00, 12:30, 15:45, 18:20, 20:30',
    15.0,
    8.5,
    '06:40 AM'
);

-- Example 2: Private Express Bus
INSERT INTO buses (bus_name, bus_number, bus_type, operator, start_stop, destination_stop, boarded_stops, bus_timings, bus_fare, distance_km, reaching_time)
VALUES (
    'Cheran Express',
    'CH-45',
    'Private',
    'Cheran Transports',
    'Gandhipuram',
    'Pollachi',
    'Gandhipuram, Ukkadam, Kinathukadavu, Pollachi',
    '06:30, 07:30, 08:45, 11:15, 14:00, 16:30, 19:15',
    45.0,
    42.0,
    '07:55 AM'
);

-- Example 3: Deluxe Bus
INSERT INTO buses (bus_name, bus_number, bus_type, operator, start_stop, destination_stop, boarded_stops, bus_timings, bus_fare, distance_km, reaching_time)
VALUES (
    '33C Deluxe',
    '33C',
    'Deluxe',
    'TNSTC Deluxe',
    'Gandhipuram',
    'Marudhamalai',
    'Gandhipuram, Navaindia, Hope College, Peelamedu, Marudhamalai',
    '07:00, 09:15, 11:30, 14:45, 17:15, 20:00',
    25.0,
    14.0,
    '07:26 AM'
);

-- Example 4: Fast Passenger Bus
INSERT INTO buses (bus_name, bus_number, bus_type, operator, start_stop, destination_stop, boarded_stops, bus_timings, bus_fare, distance_km, reaching_time)
VALUES (
    'Fast Track 7',
    'FT-07',
    'Fast',
    'TNSTC Express',
    'Gandhipuram',
    'Mettupalayam',
    'Gandhipuram, Thudiyalur, Perianaickenpalayam, Karamadai, Mettupalayam',
    '06:15, 07:45, 09:30, 12:00, 15:00, 17:30, 19:45',
    35.0,
    34.0,
    '07:08 AM'
);

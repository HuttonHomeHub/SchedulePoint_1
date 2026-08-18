-- Population for the activities-delete measurement. Direct INSERTs (see the
-- measurements README for where this bypasses the product).
BEGIN;
INSERT INTO organizations (id,name,slug,version,created_at,updated_at)
VALUES ('aa000000-0000-0000-0000-000000000001','bench','bench',1,now(),now());
INSERT INTO users (id,name,email,created_at,updated_at) VALUES ('u1','u','u@example.test',now(),now());
INSERT INTO clients (id,organization_id,name,version,created_at,updated_at)
VALUES ('aa000000-0000-0000-0000-000000000002','aa000000-0000-0000-0000-000000000001','c',1,now(),now());
INSERT INTO projects (id,organization_id,client_id,name,version,created_at,updated_at)
VALUES ('aa000000-0000-0000-0000-000000000003','aa000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000002','p',1,now(),now());
-- 200 background plans + 1 target plan
INSERT INTO plans (id,organization_id,project_id,name,planned_start,version,created_at,updated_at)
SELECT ('ab000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'aa000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000003','plan'||g,current_date,1,now(),now()
FROM generate_series(1,200) g;
INSERT INTO plans (id,organization_id,project_id,name,planned_start,version,created_at,updated_at)
VALUES ('acaaaaaa-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000003','TARGET',current_date,1,now(),now());
COMMIT;

BEGIN;
-- 200 background plans x 1000 activities = 200,000
INSERT INTO activities (id,organization_id,plan_id,name,type,updated_at,parent_id)
SELECT gen_random_uuid(),'aa000000-0000-0000-0000-000000000001',p.id,'a'||g,'TASK',now(),NULL
FROM plans p, generate_series(1,1000) g WHERE p.name LIKE 'plan%';
-- target plan: 2,000 activities, 100 of them WBS summaries in a chain, the rest children
INSERT INTO activities (id,organization_id,plan_id,name,type,updated_at,parent_id)
SELECT ('ad000000-0000-0000-0000-'||lpad(g::text,12,'0'))::uuid,'aa000000-0000-0000-0000-000000000001','acaaaaaa-0000-0000-0000-000000000001','t'||g,
       CASE WHEN g<=100 THEN 'WBS_SUMMARY'::"ActivityType" ELSE 'TASK'::"ActivityType" END, now(),
       CASE WHEN g=1 THEN NULL
            WHEN g<=100 THEN ('ad000000-0000-0000-0000-'||lpad((g-1)::text,12,'0'))::uuid
            ELSE ('ad000000-0000-0000-0000-'||lpad(((g%100)+1)::text,12,'0'))::uuid END
FROM generate_series(1,2000) g;
COMMIT;

BEGIN;
-- children of the BACKGROUND activities, so every referencing table is realistically large
INSERT INTO activity_steps (id,organization_id,activity_id,seq,name,weight,percent_complete,version,created_at,updated_at)
SELECT gen_random_uuid(),a.organization_id,a.id,1,'s',1,0,1,now(),now() FROM activities a WHERE a.plan_id <> 'acaaaaaa-0000-0000-0000-000000000001';
INSERT INTO notes (id,organization_id,entity_type,plan_id,activity_id,body,version,created_at,updated_at)
SELECT gen_random_uuid(),a.organization_id,'ACTIVITY',a.plan_id,a.id,'n',1,now(),now() FROM activities a WHERE a.plan_id <> 'acaaaaaa-0000-0000-0000-000000000001';
INSERT INTO resources (id,organization_id,name,kind,version,created_at,updated_at)
VALUES ('ae000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000001','r','LABOUR',1,now(),now());
INSERT INTO resource_assignments (id,organization_id,activity_id,resource_id,budgeted_units,is_driving,version,created_at,updated_at,actual_cost,actual_units,curve_type,lag_minutes)
SELECT gen_random_uuid(),a.organization_id,a.id,'ae000000-0000-0000-0000-000000000001',1,true,1,now(),now(),0,0,'UNIFORM',0 FROM activities a WHERE a.plan_id <> 'acaaaaaa-0000-0000-0000-000000000001';
COMMIT;
VACUUM ANALYZE;

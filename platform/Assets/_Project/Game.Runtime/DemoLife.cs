using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using AI2School.Districts;

namespace AI2School.Game
{
    /// <summary>
    /// Demo-only "life" layer: ambient walking pedestrians (animated people +
    /// robots) with a procedural walk stride. Cars now live in
    /// TrafficSimulation (road-network traffic) — this component only handles
    /// pedestrians. Independent of the core SimulationRunner.
    /// </summary>
    public class DemoLife : MonoBehaviour
    {
        [Tooltip("How many pedestrians to spawn.")]
        public int pedestrianCount = 12;
        [Tooltip("Pedestrian walk speed (m/s).")]
        public float walkSpeed = 3f;

        readonly string[] _peoplePrefabs =
        {
            "animated-human", "man", "woman-casual", "steve",
            "animated-robot", "mech", "robot", "human-dude",
        };

        DistrictManifestData _manifest;
        MinimalCity _city;
        readonly List<GameObject> _pedestrians = new List<GameObject>();
        readonly List<Vector2> _walkZones = new List<Vector2>();

        public IReadOnlyList<GameObject> Pedestrians => _pedestrians;

        public void Init(MinimalCity city)
        {
            _city = city;
            _manifest = city.Manifest;
            BuildWalkZones();
        }

        void BuildWalkZones()
        {
            var s = _manifest.footprint.sizeMeters;
            // Walkable open areas — scatter across the district, away from edges.
            _walkZones.Clear();
            for (int i = 0; i < 40; i++)
            {
                float x = Random.Range(20f, s[0] - 20f);
                float z = Random.Range(20f, s[1] - 20f);
                _walkZones.Add(new Vector2(x, z));
            }
        }

        public void SpawnAll()
        {
            SpawnPedestrians();
        }

        void SpawnPedestrians()
        {
            for (int i = 0; i < pedestrianCount; i++)
            {
                string prefabName = _peoplePrefabs[Random.Range(0, _peoplePrefabs.Length)];
                var prefab = Resources.Load<GameObject>("Prefabs/" + prefabName);
                if (prefab == null) continue;

                var go = Instantiate(prefab);
                go.transform.position = Vector3.zero;
                var b = MinimalCity.FitBounds(go);
                float scale = 1.7f / (b.size.y > 0.01f ? b.size.y : 1.7f);
                go.transform.localScale = Vector3.one * scale;
                b = MinimalCity.FitBounds(go);

                var zone = _walkZones[Random.Range(0, _walkZones.Count)];
                go.transform.position = new Vector3(zone.x, -b.min.y, zone.y);
                go.transform.SetParent(transform, false);

                var mover = go.AddComponent<DemoWalker>();
                mover.Init(this, new Vector3(zone.x, 0f, zone.y), walkSpeed);

                _pedestrians.Add(go);
            }
            Debug.Log($"[LIFE] spawned {_pedestrians.Count} pedestrians");
        }

        /// <summary>Append current pedestrian world positions (for crossing checks).</summary>
        public void CollectPedestrianPositions(List<Vector3> into)
        {
            foreach (var p in _pedestrians)
                if (p != null) into.Add(p.transform.position);
        }

        public Vector3 NextWalkTarget(Vector3 from)
        {
            if (_walkZones.Count == 0) return from;
            var zone = _walkZones[Random.Range(0, _walkZones.Count)];
            return new Vector3(zone.x, 0f, zone.y);
        }

        public void ClearAll()
        {
            foreach (var p in _pedestrians) if (p != null) Destroy(p);
            _pedestrians.Clear();
        }

        void OnDestroy()
        {
            ClearAll();
        }
    }

    /// <summary>Walks a pedestrian between random points, facing direction of travel, with a procedural stride.</summary>
    public class DemoWalker : MonoBehaviour
    {
        DemoLife _life;
        Vector3 _target;
        float _speed;
        float _stepPhase;
        Vector3 _baseScale;

        public void Init(DemoLife life, Vector3 start, float speed)
        {
            _life = life;
            _target = start;
            _speed = speed;
            _baseScale = transform.localScale;
        }

        void Start()
        {
            _baseScale = transform.localScale;
        }

        void Update()
        {
            if (_life == null) return;
            if (Vector3.Distance(transform.position, _target) < 1f)
                _target = _life.NextWalkTarget(transform.position);

            var dir = _target - transform.position;
            dir.y = 0;
            if (dir.sqrMagnitude > 0.001f)
            {
                var heading = dir.normalized;
                transform.position += heading * (_speed * Time.deltaTime);
                transform.position = new Vector3(transform.position.x, 0f, transform.position.z);
                transform.rotation = Quaternion.LookRotation(heading);

                // Procedural walk: bob the body + a subtle forward/back stride.
                _stepPhase += Time.deltaTime * 9f;   // ~1.5 steps/sec
                float bob = Mathf.Sin(_stepPhase) * 0.09f;
                float stride = Mathf.Sin(_stepPhase * 0.5f) * 0.03f;
                transform.position += Vector3.up * bob;
                transform.Translate(transform.forward * stride, Space.World);
            }
            else
            {
                // Idle: slight settle.
                transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.identity, Time.deltaTime * 4f);
            }
        }
    }
}

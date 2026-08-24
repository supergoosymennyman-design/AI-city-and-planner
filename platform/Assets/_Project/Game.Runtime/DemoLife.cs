using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using AI2School.Districts;

namespace AI2School.Game
{
    /// <summary>
    /// Demo-only "life" layer: adds ambient walking pedestrians (animated people
    /// + robots) and driving traffic (cars following road pieces) on top of the
    /// static demo city. Independent of the core SimulationRunner — purely for
    /// visual verification that rigged characters and vehicles work end-to-end.
    /// </summary>
    public class DemoLife : MonoBehaviour
    {
        [Tooltip("How many pedestrians to spawn.")]
        public int pedestrianCount = 12;
        [Tooltip("How many cars to spawn.")]
        public int carCount = 6;
        [Tooltip("Pedestrian walk speed (m/s).")]
        public float walkSpeed = 3f;
        [Tooltip("Car drive speed (m/s).")]
        public float carSpeed = 9f;

        readonly string[] _peoplePrefabs =
        {
            "animated-human", "man", "woman-casual", "steve",
            "animated-robot", "mech", "robot", "human-dude",
        };

        readonly string[] _carPrefabs =
        {
            "car", "car-sports", "car-convertible", "suv",
        };

        DistrictManifestData _manifest;
        MinimalCity _city;
        readonly List<GameObject> _pedestrians = new List<GameObject>();
        readonly List<GameObject> _cars = new List<GameObject>();
        readonly List<Vector2> _roadPoints = new List<Vector2>();
        List<Vector2> _walkZones = new List<Vector2>();

        public void Init(MinimalCity city)
        {
            _city = city;
            _manifest = city.Manifest;
            BuildWalkZones();
            CollectRoadPoints();
        }

        void BuildWalkZones()
        {
            var s = _manifest.footprint.sizeMeters;
            // Walkable open areas — just scatter across the district, away from edges.
            _walkZones.Clear();
            for (int i = 0; i < 40; i++)
            {
                float x = Random.Range(20f, s[0] - 20f);
                float z = Random.Range(20f, s[1] - 20f);
                _walkZones.Add(new Vector2(x, z));
            }
        }

        void CollectRoadPoints()
        {
            _roadPoints.Clear();
            foreach (var p in _city.Pieces)
            {
                var piece = FindPalette(p.pieceId);
                if (piece != null && piece.category == "road")
                    _roadPoints.Add(new Vector2(p.x, p.z));
            }
        }

        public void SpawnAll()
        {
            SpawnPedestrians();
            SpawnCars();
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

        void SpawnCars()
        {
            if (_roadPoints.Count < 2) return;
            for (int i = 0; i < carCount; i++)
            {
                string prefabName = _carPrefabs[Random.Range(0, _carPrefabs.Length)];
                var prefab = Resources.Load<GameObject>("Prefabs/" + prefabName);
                if (prefab == null) continue;

                var go = Instantiate(prefab);
                go.transform.position = Vector3.zero;
                var b = MinimalCity.FitBounds(go);
                float target = 4.2f; // ~car length
                float scale = target / (b.size.z > 0.01f ? b.size.z : target);
                go.transform.localScale = Vector3.one * scale;
                b = MinimalCity.FitBounds(go);

                int idx = Random.Range(0, _roadPoints.Count);
                var start = _roadPoints[idx];
                go.transform.position = new Vector3(start.x, -b.min.y, start.y);
                go.transform.SetParent(transform, false);

                var driver = go.AddComponent<DemoDriver>();
                driver.Init(this, carSpeed);
                _cars.Add(go);
            }
            Debug.Log($"[LIFE] spawned {_cars.Count} cars on {_roadPoints.Count} road points");
        }

        public Vector3 NextRoadTarget(Vector3 from)
        {
            if (_roadPoints.Count == 0) return from;
            int idx = Random.Range(0, _roadPoints.Count);
            return new Vector3(_roadPoints[idx].x, 0f, _roadPoints[idx].y);
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
            foreach (var c in _cars) if (c != null) Destroy(c);
            _pedestrians.Clear();
            _cars.Clear();
        }

        PalettePieceData FindPalette(string id)
        {
            if (_manifest?.palette == null) return null;
            foreach (var p in _manifest.palette) if (p.pieceId == id) return p;
            return null;
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

    /// <summary>Drives a car between road points, turning to face heading.</summary>
    public class DemoDriver : MonoBehaviour
    {
        DemoLife _life;
        Vector3 _target;
        float _speed;

        public void Init(DemoLife life, float speed)
        {
            _life = life;
            _speed = speed;
            _target = _life.NextRoadTarget(transform.position);
        }

        void Update()
        {
            if (_life == null) return;
            if (Vector3.Distance(transform.position, _target) < 2f)
                _target = _life.NextRoadTarget(transform.position);

            var dir = _target - transform.position;
            dir.y = 0;
            if (dir.sqrMagnitude > 0.001f)
            {
                var heading = dir.normalized;
                transform.position += heading * (_speed * Time.deltaTime);
                transform.position = new Vector3(transform.position.x, 0f, transform.position.z);
                transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(heading), Time.deltaTime * 4f);
            }
        }
    }
}

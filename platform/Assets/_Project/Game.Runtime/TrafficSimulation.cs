using System.Collections.Generic;
using UnityEngine;
using AI2School.Agents;
using AI2School.Districts;

namespace AI2School.Game
{
    /// <summary>
    /// Demo road traffic: builds a RoadNetwork from the placed road pieces and
    /// drives prefab cars along it. Deterministic core (seeded by the city
    /// master seed); cars yield to pedestrians at crossings. Runs continuously
    /// in any mode (planning or simulating) so the demo always has life.
    /// </summary>
    public class TrafficSimulation : MonoBehaviour
    {
        [Tooltip("How many cars to spawn on the road network.")]
        public int carCount = 10;

        readonly string[] _carPrefabs = { "car", "car-sports", "car-convertible", "suv", "car-mini" };

        MinimalCity _city;
        TrafficSim _sim;
        GameObject[] _carGos = new GameObject[0];
        readonly List<Vec2> _pedVec = new List<Vec2>();
        readonly List<Vector3> _scratch = new List<Vector3>();

        public TrafficSim Sim => _sim;

        public void Init(MinimalCity city)
        {
            _city = city;
            var inputs = BuildInputs(city.Pieces);
            var net = RoadNetwork.Build(inputs);
            _sim = new TrafficSim(net, city.MasterSeed, carCount);
            SpawnVisuals();
            Debug.Log($"[TRAFFIC] roads={net.RoadPieceCount} nodes={net.Nodes.Count} edges={net.Edges.Count} cars={_sim.Cars.Count}");
        }

        static List<RoadPieceInput> BuildInputs(List<PlacedPieceData> pieces)
        {
            var list = new List<RoadPieceInput>(pieces.Count);
            foreach (var p in pieces)
                if (RoadNetwork.IsRoadPiece(p.pieceId))
                    list.Add(new RoadPieceInput(p.pieceId, p.x, p.z, p.rotationY));
            return list;
        }

        void SpawnVisuals()
        {
            if (_sim == null || !_sim.HasCars) return;
            _carGos = new GameObject[_sim.Cars.Count];
            for (int i = 0; i < _carGos.Length; i++)
            {
                var prefab = Resources.Load<GameObject>("Prefabs/" + _carPrefabs[i % _carPrefabs.Length]);
                if (prefab == null) continue;
                var go = Instantiate(prefab);
                go.transform.position = Vector3.zero;
                var b = MinimalCity.FitBounds(go);
                float target = 4.2f;   // ~car length
                float scale = target / (b.size.z > 0.01f ? b.size.z : target);
                go.transform.localScale = Vector3.one * scale;
                b = MinimalCity.FitBounds(go);
                go.transform.position = new Vector3(0f, -b.min.y, 0f);
                go.transform.SetParent(transform, false);
                _carGos[i] = go;
            }
        }

        void FixedUpdate()
        {
            if (_sim == null) return;
            GatherPedestrians();
            _sim.Step(Time.fixedDeltaTime, _pedVec);
            ApplyVisuals();
        }

        void GatherPedestrians()
        {
            _pedVec.Clear();
            _scratch.Clear();
            var life = _city != null ? _city.GetComponent<DemoLife>() : null;
            if (life != null) life.CollectPedestrianPositions(_scratch);
            var runner = _city != null ? _city.GetComponent<SimulationRunner>() : null;
            if (runner != null) runner.CollectCitizenPositions(_scratch);
            foreach (var v in _scratch) _pedVec.Add(new Vec2(v.x, v.z));
        }

        void ApplyVisuals()
        {
            var cars = _sim.Cars;
            for (int i = 0; i < _carGos.Length && i < cars.Count; i++)
            {
                var go = _carGos[i];
                if (go == null) continue;
                var c = cars[i];
                go.transform.position = new Vector3(c.Pos.X, go.transform.position.y, c.Pos.Y);
                // Heading is the travel angle from +X; a forward-is-+Z model's
                // Y rotation is (90° − heading). Tune the constant if a prefab
                // faces another axis.
                go.transform.rotation = Quaternion.Euler(0f, 90f - c.Heading * Mathf.Rad2Deg, 0f);
            }
        }

        void OnDestroy()
        {
            foreach (var go in _carGos)
                if (go != null) Destroy(go);
            _carGos = new GameObject[0];
        }
    }
}

using System;
using System.Collections.Generic;
using AI2School.Core.Determinism;

namespace AI2School.Agents
{
    /// <summary>
    /// Deterministic road traffic simulation over a RoadNetwork. Cars follow
    /// lane centre-lines, keep a car-following gap, ease through junctions
    /// (yield to a closer car on another approach), and stop at pedestrian
    /// crossings when a walker is in the box. Pure C# — fully unit-testable
    /// with no pedestrians (empty list), deterministic for a given seed.
    /// </summary>
    public sealed class TrafficSim
    {
        public struct CarState
        {
            public int Edge;      // edge index currently traversed
            public int AtNode;    // node at the tail of this traversal
            public float Param;   // distance along the edge midline
            public float Speed;   // m/s
            public bool Direction;// true = A→B, false = B→A
            public Vec2 Pos;      // world position (x,z), lane-offset
            public float Heading; // radians (x,z plane)
        }

        public const float LaneOffset = 1.6f;
        public const float CruiseSpeed = 8.5f;
        public const float JunctionCruiseSpeed = 3.2f;
        public const float CarLength = 4.6f;
        public const float MinGap = 7f;
        public const float DecelDistance = 16f;
        public const float JunctionRadius = 7f;
        public const float CrossingMargin = 2.5f;
        public const float Accel = 3.2f;
        public const float Decel = 6.5f;
        public const uint RngStream = 11;

        readonly RoadNetwork _net;
        readonly DeterministicRng _rng;
        CarState[] _cars = new CarState[0];

        public IReadOnlyList<CarState> Cars => _cars;
        public bool HasCars => _cars.Length > 0;

        public TrafficSim(RoadNetwork net, ulong masterSeed, int carCount)
        {
            _net = net;
            _rng = new DeterministicRng(DeterministicRng.SeedForStream(masterSeed, RngStream));
            if (net == null || net.Edges.Count == 0 || carCount <= 0) return;
            _cars = new CarState[carCount];
            for (int i = 0; i < carCount; i++)
            {
                int e = _rng.NextInt(0, net.Edges.Count);
                var edge = net.Edges[e];
                bool dir = _rng.NextBool();
                float param = _rng.NextFloat() * edge.Length * 0.7f;
                var c = new CarState { Edge = e, AtNode = dir ? edge.A : edge.B, Param = param, Speed = CruiseSpeed, Direction = dir };
                SampleCar(c, out c.Pos, out c.Heading);
                _cars[i] = c;
            }
        }

        public void Step(float dt, IReadOnlyList<Vec2> pedestrians)
        {
            if (_cars.Length == 0 || dt <= 0f) return;
            for (int i = 0; i < _cars.Length; i++)
                _cars[i] = StepCar(_cars[i], i, dt, pedestrians);
        }

        CarState StepCar(CarState c, int idx, float dt, IReadOnlyList<Vec2> pedestrians)
        {
            var edge = _net.Edges[c.Edge];
            float target = DesiredSpeed(c, idx, edge, pedestrians);
            c.Speed = Approach(c.Speed, target, dt);
            c.Param += c.Speed * dt;

            if (c.Param >= edge.Length)
            {
                float overflow = c.Param - edge.Length;
                int dest = c.Direction ? edge.B : edge.A;
                int next = ChooseNextEdge(c, dest);
                if (next < 0)
                {
                    // Dead end → U-turn back along the same edge.
                    c.Direction = !c.Direction;
                    c.AtNode = c.Direction ? edge.A : edge.B;
                    c.Param = Math.Max(0f, edge.Length - overflow);
                }
                else
                {
                    var ne = _net.Edges[next];
                    c.Edge = next;
                    c.AtNode = dest;
                    c.Direction = ne.A == dest;   // leave dest toward the far node
                    c.Param = Math.Max(0f, overflow);
                }
            }

            SampleCar(c, out c.Pos, out c.Heading);
            return c;
        }

        float DesiredSpeed(CarState c, int idx, RoadEdgeData edge, IReadOnlyList<Vec2> pedestrians)
        {
            float target = CruiseSpeed;
            float remaining = edge.Length - c.Param;

            // Junction approach: ease off the throttle near the destination node.
            int dest = c.Direction ? edge.B : edge.A;
            if (remaining < DecelDistance)
            {
                float t = remaining / DecelDistance;
                target = Math.Min(target, JunctionCruiseSpeed + (CruiseSpeed - JunctionCruiseSpeed) * t);
            }

            // Junction yield: give way to a car already inside the junction zone
            // from a different approach. The car closer to the node has priority
            // (index tie-break keeps it deterministic).
            var nodePos = _net.Nodes[dest].Pos;
            float myDist = Math.Max(remaining, 0.1f);
            for (int k = 0; k < _cars.Length; k++)
            {
                if (k == idx) continue;
                var o = _cars[k];
                if (o.Edge == c.Edge) continue;
                float d = (o.Pos - nodePos).Magnitude;
                if (d < JunctionRadius && (d < myDist - 1f || (Math.Abs(d - myDist) <= 1f && k < idx)))
                {
                    target = Math.Min(target, 0f);
                    break;
                }
            }

            // Car-following: keep a gap to the nearest car ahead on the same lane.
            for (int k = 0; k < _cars.Length; k++)
            {
                if (k == idx) continue;
                var o = _cars[k];
                if (o.Edge != c.Edge || o.Direction != c.Direction) continue;
                float gap = o.Param - c.Param;
                if (gap > 0f && gap < MinGap)
                {
                    float f = Math.Clamp((gap - CarLength) / (MinGap - CarLength), 0f, 1f);
                    target = Math.Min(target, o.Speed * f + 0.5f);
                }
            }

            // Pedestrian crossing: stop while a walker is in the crossing zone.
            if (edge.HasCrossing && pedestrians != null && pedestrians.Count > 0)
            {
                float hx = edge.CrossingHalf.X + CrossingMargin;
                float hz = edge.CrossingHalf.Y + CrossingMargin;
                for (int k = 0; k < pedestrians.Count; k++)
                {
                    var ped = pedestrians[k];
                    if (Math.Abs(ped.X - edge.CrossingCenter.X) <= hx &&
                        Math.Abs(ped.Y - edge.CrossingCenter.Y) <= hz)
                    {
                        target = Math.Min(target, 0f);
                        break;
                    }
                }
            }

            return target;
        }

        /// <summary>Pick the next edge at a node, preferring to keep going straight.</summary>
        int ChooseNextEdge(CarState c, int atNode)
        {
            var node = _net.Nodes[atNode];
            if (node.Degree <= 1) return -1;

            var edge = _net.Edges[c.Edge];
            var inDir = c.Direction
                ? (NodePos(edge.B) - NodePos(edge.A)).Normalized()
                : (NodePos(edge.A) - NodePos(edge.B)).Normalized();

            // Straight continuation, skipping dead-end stubs.
            int best = -1;
            float bestDot = 0.9f;
            var candidates = new List<int>();
            foreach (var e in node.Edges)
            {
                if (e == c.Edge) continue;
                var cand = _net.Edges[e];
                int far = cand.A == atNode ? cand.B : cand.A;
                if (_net.Nodes[far].Degree <= 1) continue;   // dead-end stub
                candidates.Add(e);
                var outDir = cand.A == atNode
                    ? (NodePos(cand.B) - NodePos(cand.A)).Normalized()
                    : (NodePos(cand.A) - NodePos(cand.B)).Normalized();
                float dot = outDir.X * inDir.X + outDir.Y * inDir.Y;
                if (dot > bestDot) { bestDot = dot; best = e; }
            }

            if (best >= 0 && _rng.NextFloat() < 0.65f) return best;

            if (candidates.Count > 0) return candidates[_rng.NextInt(0, candidates.Count)];

            // Fallback: any other edge (may be a dead stub) rather than stalling.
            var all = new List<int>();
            foreach (var e in node.Edges) if (e != c.Edge) all.Add(e);
            return all.Count > 0 ? all[_rng.NextInt(0, all.Count)] : -1;
        }

        // ── Geometry / sampling ─────────────────────────────────────────────
        void SampleCar(CarState c, out Vec2 pos, out float heading)
        {
            var e = _net.Edges[c.Edge];
            Vec2 mid, tan;
            SampleEdge(e, c.Param, out mid, out tan);
            // Lane offset: left of travel (HK-style left-hand traffic).
            var perp = new Vec2(-tan.Y, tan.X);
            float laneSign = c.Direction ? 1f : -1f;
            pos = mid + perp * (laneSign * LaneOffset);
            heading = MathF.Atan2(tan.Y, tan.X);
        }

        static void SampleEdge(RoadEdgeData e, float param, out Vec2 pos, out Vec2 tan)
        {
            param = Math.Clamp(param, 0f, e.Length);
            float acc = 0f;
            var mid = e.Midline;
            for (int i = 0; i < mid.Length - 1; i++)
            {
                var seg = mid[i + 1] - mid[i];
                float len = seg.Magnitude;
                if (acc + len >= param || i == mid.Length - 2)
                {
                    float t = len > 1e-4f ? Math.Clamp((param - acc) / len, 0f, 1f) : 0f;
                    pos = mid[i] + seg * t;
                    tan = len > 1e-4f ? seg * (1f / len) : new Vec2(1f, 0f);
                    return;
                }
                acc += len;
            }
            pos = mid[mid.Length - 1];
            tan = new Vec2(1f, 0f);
        }

        Vec2 NodePos(int i) => _net.Nodes[i].Pos;

        static float Approach(float speed, float target, float dt)
        {
            float delta = target - speed;
            float rate = delta >= 0f ? Accel : Decel;
            float maxDelta = rate * dt;
            if (Math.Abs(delta) <= maxDelta) return target;
            return speed + Math.Sign(delta) * maxDelta;
        }
    }
}

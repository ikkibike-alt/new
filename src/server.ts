import express from "express";
import { search, facets, type SearchQuery } from "./db.js";

const app = express();
app.use(express.static("public"));

const num = (v: unknown) => (v === undefined || v === "" ? undefined : Number(v));
const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);

app.get("/api/search", (req, res) => {
  const q: SearchQuery = {
    q: str(req.query.q),
    maker: str(req.query.maker),
    model: str(req.query.model),
    pref: str(req.query.pref),
    source: str(req.query.source),
    priceMin: num(req.query.priceMin),
    priceMax: num(req.query.priceMax),
    yearMin: num(req.query.yearMin),
    mileageMax: num(req.query.mileageMax),
    sort: str(req.query.sort) as SearchQuery["sort"],
    page: num(req.query.page),
  };
  res.json(search(q));
});

app.get("/api/facets", (_req, res) => res.json(facets()));

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`http://localhost:${port}`));

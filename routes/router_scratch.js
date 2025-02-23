import logger from "../utils/logger.js";
import configManager from "../utils/configManager.js";
import jsonwebtoken from "jsonwebtoken";

import { Router } from "express";
var router = Router();
import { writeFile, exists,createReadStream } from "fs";
import { createHash } from "crypto";
import { prisma, S3updateFromPath } from "../utils/global.js";
import { needlogin } from "../middleware/auth.js";
import { getProjectFile,getProjectById } from "../controllers/projects.js";
router.all("*", function (req, res, next) {
  next();
});



router.get("/projectinfo", async function (req, res, next) {
  try {
    const project = await prisma.ow_projects.findFirst({
      where: {
        id: Number(req.query.id),
        state: "public",
        type: "scratch",
      },
      select: {
        id: true,
        authorid: true,
        time: true,
        view_count: true,
        like_count: true,
        favo_count: true,
        title: true,
        state: true,
        description: true,
        licence: true,
        tags: true,
      },
    });

    if (!project) {
      res.locals.tip = { opt: "flash", msg: "项目不存在或未发布" };
      res.status(404).send({
        code: 404,
        status: "404",
        msg: "项目不存在或未发布",
      });
      return;
    }

    const author = await prisma.ow_users.findFirst({
      where: { id: project.authorid },
      select: {
        display_name: true,
        images: true,
        motto: true,
      },
    });

    res.locals["is_author"] =
      project.authorid == res.locals.userid ? true : false;

    res.json({
      ...project,
      author_display_name: author.display_name,
      author_images: author.images,
      author_motto: author.motto,
    });
  } catch (err) {
    next(err);
  }
});


router.get("/projectinfo2", async function (req, res, next) {
  try {
    var result = await prisma.ow_projects.findFirst({
      where: {
        id: Number(req.query.id),
      },
    });
    var author = await prisma.ow_users.findFirst({
      where: {
        id: result.authorid,
      },
    });
    res.locals["is_author"] =
      result.authorid == res.locals.userid ? true : false;
    logger.debug(result);
    var resulttype = {
      id: 50,
      type: "scratch",
      licence: "no",
      authorid: 89,
      teacherid: 0,
      state: "public",
      view_count: 119,
      like_count: 0,
      favo_count: 0,
      time: "2024-06-22T10:32:42.000Z",
      title: "title",
      description: "description",
      source: "source",
      history: true,
      devenv: true,
      devsource: "devsource",
      tags: "",
    };
    var project_token = jsonwebtoken.sign(
      {
        exp: Math.floor(Date.now() / 1000) + 60 * 5,
        data: {
          type: "project",
          action: "read",
          issuer: await configManager.getConfig("site.domain"),
          projectid: result.id,
          userid: res.locals.userid,
        },
      },
      await configManager.getConfig("security.jwttoken")
    );
    logger.debug(project_token);
    var jsonscratch = {
      id: result.id,
      title: result.title,
      description: result.description,
      instructions: "ZeroCat社区",
      visibility: "visible",
      public: result.state == "public" ? true : false,
      comments_allowed: true,
      is_published: result.state == "public" ? true : false,
      author: {
        id: result.authorid,
        username: author.display_name,
        scratchteam: author.id == 1 ? true : false,
        history: {
          joined: author.createdAt,
        },
        profile: {
          id: null,
          images: {
            "90x90": `${global.config["urls.static"]}/user/${author.images}`,
            "60x60": `${global.config["urls.static"]}/user/${author.images}`,
            "55x55": `${global.config["urls.static"]}/user/${author.images}`,
            "50x50": `${global.config["urls.static"]}/user/${author.images}`,
            "32x32": `${global.config["urls.static"]}/user/${author.images}`,
          },
        },
      },
      image: `${global.config["urls.static"]}/scratch_slt/${result.id}`,
      images: {
        "282x218": `${global.config["urls.static"]}/scratch_slt/${result.id}`,
        "216x163": `${global.config["urls.static"]}/scratch_slt/${result.id}`,
        "200x200": `${global.config["urls.static"]}/scratch_slt/${result.id}`,
        "144x108": `${global.config["urls.static"]}/scratch_slt/${result.id}`,
        "135x102": `${global.config["urls.static"]}/scratch_slt/${result.id}`,
        "100x80": `${global.config["urls.static"]}/scratch_slt/${result.id}`,
      },
      history: {
        created: result.createdAt,
        modified: result.createdAt,
        shared: result.createdAt,
      },
      stats: {
        views: result.view_count,
        loves: 0,
        favorites: 0,
        remixes: 0,
      },
      remix: {
        parent: null,
        root: null,
      },
      project_token,
    };
    ////logger.logger.debug(SCRATCH[0]);
    res.json(jsonscratch);
  } catch (err) {
    next(err);
  }
});

// 获取源代码
router.get("/project/:id", async (req, res, next) => {
  try {
    if (!req.params.id) {
      return res.status(400).send({ status: "0", msg: "缺少项目ID" });
    }
    let project_token;
    if (req.query.token) {
      try {
        logger.debug(await configManager.getConfig("security.jwttoken"));
        project_token = jsonwebtoken.verify(
          req.query.token,
          await configManager.getConfig("security.jwttoken")
        );
        logger.debug(project_token);
      } catch (err) {
        logger.debug("Error verifying project token:", err);
        return res.status(403).send({ status: "0", msg: "无权访问此项目" });
      }
      if (project_token.data.projectid != req.params.id) {
        logger.debug("1");
        return res.status(403).send({ status: "0", msg: "无权访问此项目" });
      }
      if (res.locals.userid && project_token.data.userid != res.locals.userid) {
        logger.debug("2");
        return res.status(403).send({ status: "0", msg: "无权访问此项目" });
      }
    } else {
      logger.debug("3");
      return res.status(403).send({ status: "0", msg: "无权访问此项目" });
    }
    const project = await prisma.ow_projects.findFirst({
      where: { id: Number(project_token.data.projectid) },
    });

    if (!project) {
      return res.status(404).send({ status: "0", msg: "作品不存在或无权打开" });
    }

    const source =
      project.authorid === project_token.data.userid
        ? project.devsource
        : project.source;
    const projectFile = await getProjectFile(source);

    if (projectFile?.source) {
      res.status(200).send(projectFile.source);
    } else {
      res.status(403).send({ status: "0", msg: "无权访问此项目" });
    }
  } catch (err) {
    logger.error("Error fetching project source code:", err);
    next(err);
  }
});






//保存作品：缩略图
router.post("/thumbnail/:projectid", function (req, res, next) {
  try {
    const _data = [];
    req.on("data", (chunk) => _data.push(chunk));
    req.on("end", async () => {
      try {
        const project = await getProjectById(Number(req.params.projectid));
        if (!project) {
          res.status(404).send({ status: "0", code: "404", msg: "作品不存在" });
          return;
        }
        if (project.authorid !== res.locals.userid) {
          res.status(403).send({ status: "0",  code: "403", msg: "无权访问此项目" });
          return;
        }
        const content = Buffer.concat(_data);
        await S3updateFromPath(`scratch_slt/${req.params.projectid}`, content);
        res.status(200).send({ status: "ok" });
      } catch (err) {
        res.status(500).send({ status: "error", message: "上传失败" });
        logger.error("Error uploading project thumbnail:", err);
      }
    });
  } catch (err) {
    next(err);
  }
});
//新作品：保存作品素材
router.post("/assets/:filename", needlogin, function (req, res, next) {
  try {
    if (!req.files || !req.files.file) {
      logger.debug("No file uploaded");
      return res.status(400).send({ status: "error", message: "No file uploaded" });
    }

    const file = req.files.file;
    const hash = createHash("md5");
    const chunks = createReadStream(file.path);
    chunks.on("data", (chunk) => hash.update(chunk));
    chunks.on("end", async () => {
      const hashValue = hash.digest("hex");
      const ext = req.params.filename.split('.').pop();
      const newFilename = `${hashValue}.${ext}`;
      logger.debug(`File hash computed: ${hashValue}`);
      await S3updateFromPath(`material/asset/${newFilename}`, file.path);
      logger.debug(`Uploaded to S3 at path: material/asset/${newFilename}`);
      res.status(200).send({ status: "ok" });
    });
  } catch (err) {
    next(err);
  }
});



export default router;

import jwt from "jsonwebtoken";
import mongoose, { ObjectId } from "mongoose";
import { fileURLToPath } from "url";
import RangeParser from "range-parser";
import Resize from "../Controller/Resize.js";
import md5 from "md5";
import Film from "../models/FilmModel.js";
import User from "../models/UserModel.js";
import { v4 as uuidv4 } from "uuid";
import { promises as fileSystem } from "fs";
import { getObject, getObjectSignedUrl, uploadStream } from "./S3Controller.js";

export async function loginAdmin(req, res) {
  try {
    const { username, password } = req.body;
    let data = await User.findOne({
      username: username,
      password: md5(password),
    });
    if (data) {
      let payload = data.toObject();
      const token = jwt.sign(payload, process.env.JWT_SECRET_TOKEN_ADMIN);
      return res.status(200).json({ status: true, token: token });
    } else {
      return res.status(200).json({
        status: false,
        message: "Tài Khoản Hoặc Mật Khẩu Không Chính Xác",
      });
    }
  } catch (err) {
    console.log(err);
    res.json({ status: false, message: err });
  }
}

export async function countAdmin(req, res) {
  try {
    const dataUser = await User.find({});
    const dataPhim = await Film.find({});
    res.json({
      status: true,
      userCount: dataUser?.length,
      filmCount: dataPhim?.length,
      dataUser,
      dataPhim,
    });
  } catch (err) {
    console.log(err);
    res.json({ status: false, message: err });
  }
}

export async function registerAdmin(req, res) {
  try {
    const { username, password, displayname } = req.body;

    let data = await User.findOne({
      username: username,
    });
    if (data) {
      res.json({
        status: false,
        message: "Tài khoản đã tồn tại.",
      });
    } else {
      const newUser = new User({
        displayname: displayname,
        username: username,
        password: md5(password),
        role: "admin",
      });
      await newUser.save();
      res
        .status(200)
        .json({ status: true, message: `Create ${username} done` });
    }
  } catch (err) {
    console.log(err);
    res.json({ status: false, message: err });
  }
}

const writeVideo = async (path, data) => {
  const dataWrite = Buffer.from(
    data.replace(/^data:video\/\w+;base64,/, ""),
    "base64",
  );

  await fileSystem.writeFile(path, dataWrite, { encoding: "base64" });

  let newPath = path.replace("public/videos/", "");

  return newPath;
};

const compressVideo = async (video, path) => {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(video)
      .output(path)
      .videoCodec("libx264")
      .outputOptions("-crf 28")
      .on("end", () => {
        console.log("Nén video hoàn thành!");
        resolve();
      })
      .on("error", (err) => {
        console.error("Lỗi khi nén video:", err);
        reject(err);
      })
      .run();
  });
};

export const addEpisodeFilm = async (req, res) => {
  try {
    // Xác thực token
    const data = req.dataUser;

    if (data.role === "admin") {
      const { id, name, image, description, kind, video } = req.body;

      if (!image || !video) return res.sendStatus(400);

      const film = await Film.findById(id);

      if (!film) {
        throw new Error("Không tìm thấy bộ phim");
      }

      const path = await writeImg(`public/images/${uuidv4()}.png`, image);
      const newvideo = await compressVideo(
        video,
        `public/videos/${uuidv4()}.mp4`,
      );
      // const pathVideo = await writeVideo(
      //   `public/videos/${uuidv4()}.mp4`,
      //   newvideo
      // );

      film.episode.push({
        name: name,
        description: description,
        kind: kind,
        view: 0,
        image: path,
        film: newvideo.output,
      });

      await film.save();

      res.json({ status: true, message: "Thêm thành công" });
    } else {
      throw new Error("Bạn không có đủ quyền");
    }
  } catch (err) {
    res.json({ status: false, message: err.message });
  }
};

const writeImg = async (path, data) => {
  const dataWrite = Buffer.from(
    data.replace(/^data:image\/\w+;base64,/, ""),
    "base64",
  );

  await fileSystem.writeFile(path, dataWrite, { encoding: "base64" });

  let newPath = path.replace("public/images/", "");

  return newPath;
};

export const addFilm = async (req, res) => {
  try {
    // verify token
    const data = req.dataUser;

    if (data.role == "admin") {
      const { name, image, description, kind, video } = req.body;

      if (!image || !video) return res.sendStatus(400).json({ status: false });

      const newFilm = new Film({
        name: name,
        description: description,
        kind: kind,
        view: 0,
        image: image,
        film: video,
      });
      await newFilm.save();
      res.json({ status: true, message: `Thêm thành công` });
    } else {
      throw new Error("Bạn không có đủ quyền");
    }
  } catch (err) {
    console.log(err);
    res.json({ status: false, message: err.message });
  }
};

export const getAllFilm = async (req, res) => {
  try {
    let data = await Film.find({});
    res.json({ status: true, data: data });
  } catch (err) {
    console.log(err);
    res.json({ status: false, message: err });
  }
};

export const getFilm = async (req, res) => {
  try {
    const id = req.params.id;
    let data = await Film.findOne({ _id: id });
    res.json({ status: true, data: data });
  } catch (err) {
    console.log(err);
    res.json({ status: false, message: err });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const { _id } = req.body;
    await User.deleteOne({ _id });

    res.json({ status: true, message: `Xoá thành công User có id: ${_id}` });
  } catch (err) {
    console.log(err);
    res.json({ status: false, message: err });
  }
};
export const deleteFilm = async (req, res) => {
  try {
    const { _id } = req.body;
    await Film.deleteOne({ _id });

    res.json({ status: true, message: `Xoá thành công Film có id: ${_id}` });
  } catch (err) {
    console.log(err);
    res.json({ status: false, message: err });
  }
};

export const deleteEpisode = async (req, res) => {
  try {
    const { idfilm, idepisode } = req.body;
    const film = await Film.findById(idfilm);
    const episode = film?.episode;
    const newArray = episode.filter((obj) => {
      if (obj._id === undefined) {
        return false; // Bỏ qua đối tượng với _id không xác định
      }
      return !obj._id.equals(idepisode);
    });
    film.episode = newArray;
    await film.save();
    res.json({
      status: true,
      message: `Xoá thành công tập có id: ${idepisode}`,
    });
  } catch (err) {
    console.log(err);
    res.json({ status: false, message: err });
  }
};

export const getAllUser = async (req, res) => {
  try {
    let data = await User.find({});
    res.json({ status: true, data: data });
  } catch (err) {
    console.log(err);
    res.json({ status: false, message: err });
  }
};

export const uploadFilmURL = async (req, res) => {
  try {
    console.log(req.files["video"]);
    const fileUpload = {
      filename: req.files["video"].name,
      originalname: req.files["video"].name,
      encoding: req.files["video"].encoding,
      mimetype: req.files["video"].mimetype,
      size: req.files["video"].size,
      buffer: req.files["video"].data,
    };
    const url = await uploadStream(fileUpload);

    res.json({ status: true, message: "success", data: url.Key });
  } catch (err) {
    console.log(err);
    res.json({ status: false, message: err });
  }
};

// const respo = await getObjectSignedUrl(url.Key);

export const uploadImageURL = async (req, res) => {
  try {
    const fileUpload = {
      filename: req.files["image"].name,
      originalname: req.files["image"].name,
      encoding: req.files["image"].encoding,
      mimetype: req.files["image"].mimetype,
      size: req.files["image"].size,
      buffer: req.files["image"].data,
    };
    const url = await uploadStream(fileUpload);
    res.json({ status: true, message: "success", data: url.Key });
  } catch (err) {
    console.log(err);
    res.json({ status: false, message: err });
  }
};

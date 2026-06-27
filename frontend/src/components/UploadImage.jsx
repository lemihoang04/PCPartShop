import React, { useState } from "react";
import axios from "axios"; // Import the standard axios for external API calls

const UploadImage = ({ onImageUploaded }) => {
  const [image, setImage] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    
    // Reset previous state
    setError("");
    
    // Validate file
    if (file) {
      // Check file size (10MB max)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        setError(`Ảnh quá lớn (tối đa 10MB). Kích thước hiện tại: ${(file.size / (1024 * 1024)).toFixed(2)}MB`);
        return;
      }
      
      // Check file type
      if (!file.type.match('image.*')) {
        setError('Vui lòng chọn file ảnh hợp lệ (JPEG, PNG, GIF, etc.)');
        return;
      }
      
      setImage(file);
      
      // Create a preview URL for immediate display
      const previewUrl = URL.createObjectURL(file);
      setImageUrl(previewUrl);
    }
  };
  const handleUpload = async () => {
    if (!image) {
      setError("Chưa chọn ảnh!");
      return;
    }

    setLoading(true);
    setError("");
    
    // Create FormData and append file
    const formData = new FormData();
    formData.append("file", image);
    formData.append("upload_preset", "my_preset");
    
    try {
      // Using standard axios for Cloudinary direct upload (not our custom instance)
      const res = await axios.post(
        "https://api.cloudinary.com/v1_1/dptatoir3/image/upload",
        formData
      );
      
      // Standard axios keeps the full response structure
      console.log("Cloudinary response:", res);
      
      if (res.data && res.data.secure_url) {
        const uploadedUrl = res.data.secure_url;
        setImageUrl(uploadedUrl);
        
        // Call the callback function if provided
        if (onImageUploaded) {
          onImageUploaded(uploadedUrl);
        }
      } else {
        throw new Error('Không nhận được URL ảnh từ máy chủ');
      }
    } catch (err) {
      console.error("Error uploading image:", err);
      setError(err.response?.data?.error?.message || 
               err.message || 
               "Không thể tải ảnh lên. Vui lòng thử lại sau.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="upload-image-container">
      <div className="file-input-container">
        <input 
          type="file" 
          onChange={handleFileChange} 
          accept="image/*"
          className="file-input"
        />
        <button 
          onClick={handleUpload} 
          disabled={!image || loading}
          className={`upload-button ${loading ? 'loading' : ''}`}
        >
          {loading ? 'Đang tải...' : 'Upload ảnh'}
        </button>
      </div>
      
      {error && <div className="error-message">{error}</div>}

      {imageUrl && (
        <div className="image-preview-container">
          <h3>Ảnh xem trước:</h3>
          <img 
            src={imageUrl} 
            alt="thumbnail" 
            className="image-preview" 
            width={200} 
          />
          <div className="image-url">
            <p>Link ảnh:</p>
            <input 
              type="text" 
              value={imageUrl} 
              readOnly 
              className="image-url-input"
              onClick={(e) => e.target.select()}
            />
          </div>
        </div>
      )}
      
      <style jsx>{`
        .upload-image-container {
          margin-bottom: 20px;
          padding: 15px;
          border-radius: 8px;
          background-color: #f8f9fa;
        }
        
        .file-input-container {
          display: flex;
          gap: 10px;
          margin-bottom: 15px;
        }
        
        .file-input {
          flex: 1;
          padding: 8px;
          border: 1px solid #ced4da;
          border-radius: 4px;
        }
        
        .upload-button {
          background-color: #007bff;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        
        .upload-button:hover {
          background-color: #0069d9;
        }
        
        .upload-button:disabled {
          background-color: #6c757d;
          cursor: not-allowed;
        }
        
        .upload-button.loading {
          opacity: 0.7;
        }
        
        .error-message {
          color: #dc3545;
          margin-bottom: 15px;
        }
        
        .image-preview-container {
          margin-top: 15px;
        }
        
        .image-preview {
          border: 1px solid #dee2e6;
          border-radius: 4px;
          max-width: 100%;
          height: auto;
          margin-bottom: 10px;
        }
        
        .image-url {
          margin-top: 10px;
        }
        
        .image-url p {
          margin-bottom: 5px;
          font-weight: bold;
        }
        
        .image-url-input {
          width: 100%;
          padding: 8px;
          border: 1px solid #ced4da;
          border-radius: 4px;
          background-color: #e9ecef;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
};

export default UploadImage;
